import { it, expect, vi, beforeEach, afterEach } from "vitest";
const { session, db, send } = vi.hoisted(() => ({
  session: vi.fn(),
  db: { add: vi.fn(), exists: vi.fn(), remove: vi.fn(), emailed: vi.fn() },
  send: vi.fn(),
}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth-session", () => ({ getRequestSession: session }));
vi.mock("@/lib/accountEmail", () => ({ sendAccountEmail: send }));
vi.mock("@/lib/database", () => ({ getDatabasePool: vi.fn() }));
vi.mock("@/lib/betaInvites", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/betaInvites")>()),
  addInvite: db.add,
  inviteExists: db.exists,
  removeInvite: db.remove,
  markInviteEmailed: db.emailed,
}));
import { manageInvite } from "./betaInviteActions";

const form = (fields: Record<string, string>) => {
  const data = new FormData();
  for (const [k, v] of Object.entries(fields)) data.set(k, v);
  return data;
};
const initial = { ok: false, message: "" };
const owner = { user: { id: "owner-1", email: "Owner@Example.test", emailVerified: true } };

beforeEach(() => {
  vi.stubEnv("BASELINE_OWNER_EMAIL", "owner@example.test");
  vi.stubEnv("BETTER_AUTH_URL", "https://baseline.example.test/");
  session.mockReset().mockResolvedValue(owner);
  for (const fn of Object.values(db)) fn.mockReset();
  db.add.mockResolvedValue(true);
  db.exists.mockResolvedValue(true);
  db.remove.mockResolvedValue(true);
  send.mockReset().mockResolvedValue(undefined);
});
afterEach(() => vi.unstubAllEnvs());

it("refuses anyone who isn't the verified owner", async () => {
  session.mockResolvedValueOnce(null);
  session.mockResolvedValueOnce({ user: { id: "u2", email: "beta@example.test", emailVerified: true } });
  session.mockResolvedValueOnce({ user: { ...owner.user, emailVerified: false } });
  for (let i = 0; i < 3; i++)
    expect(await manageInvite(initial, form({ op: "add", email: "new@example.test" }))).toEqual({
      ok: false,
      message: "Only the owner account can manage invites.",
    });
  expect(db.add).not.toHaveBeenCalled();
});

it("adds a normalized invite without email when the box is unticked", async () => {
  const result = await manageInvite(initial, form({ op: "add", email: "  Sam@Example.TEST ", note: "Run club" }));
  expect(db.add).toHaveBeenCalledWith("sam@example.test", "Run club", "owner-1");
  expect(send).not.toHaveBeenCalled();
  expect(result.ok).toBe(true);
});

it("emails the sign-up link when asked and records it", async () => {
  const result = await manageInvite(initial, form({ op: "add", email: "sam@example.test", send: "yes" }));
  expect(send).toHaveBeenCalledWith("invite", "sam@example.test", "https://baseline.example.test/?join=sam%40example.test");
  expect(db.emailed).toHaveBeenCalledWith("sam@example.test");
  expect(result).toEqual({ ok: true, message: "Invited sam@example.test and emailed their sign-up link." });
});

it("keeps the invite and says so when the email fails", async () => {
  send.mockRejectedValueOnce(new Error("nope"));
  vi.spyOn(console, "error").mockImplementationOnce(() => {});
  const result = await manageInvite(initial, form({ op: "add", email: "sam@example.test", send: "yes" }));
  expect(result.ok).toBe(true);
  expect(result.message).toContain("didn't send");
  expect(db.emailed).not.toHaveBeenCalled();
});

it("rejects bad addresses, the owner's own address and duplicates", async () => {
  expect((await manageInvite(initial, form({ op: "add", email: "not-an-email" }))).ok).toBe(false);
  expect((await manageInvite(initial, form({ op: "add", email: "OWNER@example.test" }))).ok).toBe(false);
  db.add.mockResolvedValueOnce(false);
  expect(await manageInvite(initial, form({ op: "add", email: "sam@example.test" }))).toEqual({
    ok: false,
    message: "sam@example.test is already on the list.",
  });
});

it("removes and re-sends only invites that exist", async () => {
  expect((await manageInvite(initial, form({ op: "remove", email: "sam@example.test" }))).ok).toBe(true);
  expect(db.remove).toHaveBeenCalledWith("sam@example.test");
  expect((await manageInvite(initial, form({ op: "resend", email: "sam@example.test" }))).ok).toBe(true);
  db.exists.mockResolvedValueOnce(false);
  expect((await manageInvite(initial, form({ op: "resend", email: "gone@example.test" }))).ok).toBe(false);
  expect(send).toHaveBeenCalledTimes(1);
});
