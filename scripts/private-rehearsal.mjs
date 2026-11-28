import { randomUUID } from "node:crypto";
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  symlink,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFileSync, spawn } from "node:child_process";
import assert from "node:assert/strict";
import { hashPassword } from "better-auth/crypto";
import { Pool } from "pg";

// Creates and removes only databases with this run's generated identifiers.
const url = new URL(process.env.BASELINE_QA_ADMIN_URL ?? "");
if (
  process.env.BASELINE_REHEARSAL !== "synthetic" ||
  !["localhost", "127.0.0.1"].includes(url.hostname)
) {
  throw new Error(
    "Set BASELINE_REHEARSAL=synthetic and a loopback BASELINE_QA_ADMIN_URL with CREATE DATABASE permission.",
  );
}
// DROP DATABASE ... WITH (FORCE) in cleanup terminates backends (57P01). A pool can
// resolve end() before its last socket closes, so ignore that one teardown error.
function guarded(pool) {
  pool.on("error", (error) => {
    if (error.code === "57P01") return;
    console.error(error);
    process.exitCode = 1;
  });
  return pool;
}
const admin = guarded(new Pool({ connectionString: url.href }));
const runId = randomUUID().replaceAll("-", "");
const created = [];
const root = await mkdtemp(path.join(tmpdir(), "baseline-rehearsal-"));
const origin = "http://localhost:3300";
let app;
function execute(command, args, env = process.env, output = "inherit") {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { env, stdio: output });
    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`${command} failed during synthetic rehearsal`)),
    );
  });
}
async function database(suffix) {
  const name = `baseline_qa_${runId}_${suffix}`;
  await admin.query(`CREATE DATABASE ${name}`);
  created.push(name);
  const connection = new URL(url);
  connection.pathname = "/" + name;
  return connection.href;
}
async function ready(endpoint) {
  for (let attempt = 0; attempt < 90; attempt++) {
    try {
      if ((await fetch(endpoint)).ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error("The loopback rehearsal service did not become ready.");
}
async function stopApp() {
  if (!app || app.exitCode !== null) return;
  const child = app;
  app = undefined;
  await new Promise((resolve) => {
    child.once("exit", resolve);
    child.kill("SIGTERM");
  });
}
try {
  const serverMajor = Math.floor(
    Number(
      (await admin.query("SHOW server_version_num")).rows[0].server_version_num,
    ) / 10000,
  );
  for (const utility of ["pg_dump", "pg_restore"]) {
    const version = execFileSync(utility, ["--version"], { encoding: "utf8" });
    if (Number(version.match(/(\d+)\./)?.[1]) !== serverMajor)
      throw new Error(
        "Use pg_dump and pg_restore from the PostgreSQL server's major version.",
      );
  }
  await ready("http://127.0.0.1:8025/readyz");
  for (const mode of ["browser", "api"]) {
    const dbUrl = await database(mode);
    const pool = guarded(new Pool({ connectionString: dbUrl }));
    try {
      for (const migration of (await readdir("database/migrations")).sort())
        await pool.query(
          await readFile("database/migrations/" + migration, "utf8"),
        );
      const env = {
        ...process.env,
        DATABASE_URL: dbUrl,
        BASELINE_OWNER_EMAIL: `qa-${randomUUID()}@example.test`,
        BASELINE_MAIL_TRANSPORT: "mailpit",
        BETTER_AUTH_URL: origin,
        NEXT_PUBLIC_APP_URL: origin,
        BETTER_AUTH_SECRET: randomUUID() + randomUUID(),
        BASELINE_API_ONLY: mode === "api" ? "1" : "0",
        NODE_ENV: "development",
      };
      app = spawn(
        process.execPath,
        [
          "node_modules/next/dist/bin/next",
          "dev",
          "-H",
          "127.0.0.1",
          "-p",
          "3300",
        ],
        { env, stdio: "ignore" },
      );
      await ready(origin + "/demo");
      await execute("npm", ["run", "test:e2e"], env);
      await stopApp();
      if (mode === "browser") {
        const owner = (
          await pool.query("SELECT id FROM users WHERE email=$1", [
            env.BASELINE_OWNER_EMAIL,
          ])
        ).rows[0].id;
        const other = randomUUID();
        await pool.query(
          "INSERT INTO users(id,email,display_name,email_verified) VALUES($1,$2,'Restore fixture',true)",
          [other, other + "@example.test"],
        );
        await pool.query(
          "INSERT INTO daily_check_ins(user_id,local_date,note) VALUES($1,'2026-11-01','Synthetic only')",
          [other],
        );
        const rollbackPassword = randomUUID();
        await pool.query(
          "INSERT INTO user_accounts(id,user_id,account_id,provider_id,password) VALUES($1,$2,$3,'credential',$4)",
          [randomUUID(), other, other, await hashPassword(rollbackPassword)],
        );
        const backup = path.join(root, "snapshot.dump");
        const backupConnection = new URL(dbUrl);
        await execute("pg_dump", ["--format=custom", "--file", backup], {
          ...process.env,
          PGHOST: backupConnection.hostname,
          PGPORT: backupConnection.port,
          PGUSER: decodeURIComponent(backupConnection.username),
          PGPASSWORD: decodeURIComponent(backupConnection.password),
          PGDATABASE: backupConnection.pathname.slice(1),
        });
        // Reconcile a deletion made after the snapshot and invalidate recovered access.
        await pool.query("DELETE FROM users WHERE id=$1", [owner]);
        const restoreUrl = await database("restore");
        await execute("pg_restore", [
          "--exit-on-error",
          "--dbname",
          restoreUrl,
          backup,
        ]);
        const restored = guarded(new Pool({ connectionString: restoreUrl }));
        try {
          assert.equal(
            (await restored.query("SELECT 1 FROM users WHERE id=$1", [owner]))
              .rowCount,
            1,
          );
          await restored.query("BEGIN");
          await restored.query("DELETE FROM users WHERE id=$1", [owner]);
          await restored.query("DELETE FROM user_sessions");
          await restored.query("DELETE FROM auth_verifications");
          await restored.query("COMMIT");
          for (const table of [
            "daily_metrics",
            "daily_check_ins",
            "user_accounts",
            "user_sessions",
          ])
            assert.equal(
              (
                await restored.query(
                  `SELECT 1 FROM ${table} WHERE user_id=$1`,
                  [owner],
                )
              ).rowCount,
              0,
            );
          assert.equal(
            (
              await restored.query(
                "SELECT 1 FROM daily_check_ins WHERE user_id=$1",
                [other],
              )
            ).rowCount,
            1,
          );
          const rollback = path.join(root, "prior-release");
          await mkdir(rollback);
          const archive = path.join(root, "prior-release.tar");
          await execute("git", [
            "archive",
            "--format=tar",
            "--output",
            archive,
            "72d2f2cad04747b3cff140d901fd8be8288ceb18",
          ]);
          await execute("tar", ["-xf", archive, "-C", rollback]);
          await symlink(
            path.resolve("node_modules"),
            path.join(rollback, "node_modules"),
            "dir",
          );
          // Webpack resolves this disposable shared dependency directory explicitly.
          app = spawn(
            process.execPath,
            [
              path.resolve("node_modules/next/dist/bin/next"),
              "dev",
              "--webpack",
              "-H",
              "127.0.0.1",
              "-p",
              "3300",
            ],
            {
              cwd: rollback,
              env: { ...env, DATABASE_URL: restoreUrl },
              stdio: "ignore",
            },
          );
          await ready(origin + "/demo");
          const signIn = await fetch(origin + "/api/auth/sign-in/email", {
            method: "POST",
            headers: { origin, "content-type": "application/json" },
            body: JSON.stringify({
              email: other + "@example.test",
              password: rollbackPassword,
            }),
          });
          assert.equal(signIn.status, 200);
          const cookie = signIn.headers
            .getSetCookie()
            .map((value) => value.split(";")[0])
            .join("; ");
          const exported = await fetch(origin + "/api/export", {
            headers: { cookie },
          });
          assert.equal(exported.status, 200);
          const recovered = await exported.json();
          assert.equal(recovered.check_ins.length, 1);
          assert.equal(recovered.check_ins[0].note, "Synthetic only");
          await stopApp();
          console.log(
            "PASS previous release rollback with retained-account sign-in and export.",
          );
          console.log(
            "PASS synthetic backup, offline restore, deletion reconciliation and retained-account check.",
          );
        } finally {
          await restored.end();
        }
      }
    } finally {
      await pool.end();
    }
  }
} finally {
  await stopApp();
  for (const name of created.reverse())
    await admin.query(`DROP DATABASE ${name} WITH (FORCE)`);
  await admin.end();
  await rm(root, { recursive: true, force: true });
}
