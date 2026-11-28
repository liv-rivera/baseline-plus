# Baseline

Baseline is a personal recovery and activity dashboard. Daily records and their activity contributions are stored in PostgreSQL and served through the Next.js API.

## PostgreSQL Setup

1. Create a PostgreSQL database with your provider or local PostgreSQL installation.
2. Copy `.env.example` to `.env.local` and set `DATABASE_URL` to the database connection string. Generate a private auth secret with `openssl rand -base64 32`. Set `BETTER_AUTH_SECRET` and `BETTER_AUTH_URL` for the deployment. `NEXT_PUBLIC_APP_URL` must match the public application URL.
3. Load the environment and apply the schema, provider-integration foundation, auth tables, and development data once:

```bash
set -a
source .env.local
set +a
npm run db:migrate
npm run db:migrate:providers
npm run db:migrate:webhook-minimization
npm run db:migrate:auth
npm run db:migrate:optional-readiness
npm run db:migrate:journal
npm run db:migrate:apple-health
npm run db:seed
```

The seed gives the demo account six weeks of fictional records ending on the day you run it: runs, rides, swims, yoga and light strength work, daily check-ins, and one rough week in the middle. Running it again resets the demo account's records. The read-only sample dashboard at `/demo` shows the same fictional weeks through the same dashboard you see when signed in, and never queries account records. Both come from `src/lib/sampleData.ts`; after changing that file, run `npm run db:seed:generate` to rewrite `database/seed.sql`.

4. With Node 22.12 or newer, install the pinned dependencies and start the app:

```bash
npm ci
npm run dev -- -H 127.0.0.1
```

Set `BASELINE_OWNER_EMAIL` to the one address allowed to create an account. An empty value closes registration. This controls new users; existing credentials continue to work. For synthetic testing, use a disposable database and an address at `example.test`.

For local verification and password recovery, start Mailpit with its listeners restricted to loopback:

```bash
mailpit --listen 127.0.0.1:8025 --smtp 127.0.0.1:1025
```

Use `BASELINE_MAIL_TRANSPORT=mailpit` and open `http://127.0.0.1:8025` for the fixture inbox. Production requires `BASELINE_MAIL_TRANSPORT=resend`, a server-side `RESEND_API_KEY` and an authorized `RESEND_FROM_EMAIL`. The login page offers verification resend and password recovery. Each email request endpoint permits one request per client per minute. Reset links expire after 30 minutes. A successful reset ends existing sessions. Keep auth callback URLs out of proxy and hosting logs.

For local PostgreSQL without TLS, remove `?sslmode=require` from the example URL. Use a separate, disposable database for integration tests. For managed databases, use the provider’s TLS connection string.

To retain access to the seeded dashboard data locally, set `BASELINE_DEMO_PASSWORD` to a password of at least 12 characters and run `NODE_ENV=development npm run auth:bootstrap-demo`. This marks only the seeded demo user as verified and creates or updates its Better Auth credential. The script refuses to run unless `NODE_ENV=development`.

## Data Model

`users` owns daily records. `daily_metrics` remains the dashboard projection, one row per user and local date, indexed by `(user_id, metric_date DESC)`. `metric_contributions` stores the existing detail-page contributions.

The provider foundation adds `provider_connections` for consent/scopes and encrypted-token fields, `provider_records` for external identity and normalization status, `activities` and `activity_sources` for cross-provider workout reconciliation, typed `metric_observations`, `daily_metric_aggregates`, and algorithm-versioned `recovery_scores`. `provider_sync_cursors` and `provider_sync_jobs` support backfill and incremental work; `provider_webhook_events` stores only event identifiers/status, not raw webhook payloads. Provider records can carry retention deadlines so provider-specific purge policies can be enforced.

These tables are foundation only: provider OAuth, webhook handlers, workers, device companions, and the new aggregate/score pipeline are not implemented yet. Strava is intentionally not connected: its June 2026 API policy appears to prohibit the persistent storage and cross-source analytics Baseline needs. Obtain written provider clarification and legal approval before implementing any Strava-derived storage or scoring. Garmin also requires program approval and may license specific commercial metrics; Oura requires app approval above 10 users.

Before building connectors, use the authenticated server session as the sole source of user identity. Store provider tokens only encrypted at rest, never return credentials to the client, request minimal scopes, verify webhook signatures, enqueue event processing, and implement disconnect, provider revocation, user deletion, retention purges, and periodic reconciliation.

Chart queries read a bounded window of recent records; averages are computed in PostgreSQL across the user's full history. Imports are validated on the server and inserted in a transaction. For CSV imports, if any date already exists, the whole batch is rejected. Apple Health imports skip dates that already exist instead (see below). `DATABASE_POOL_MAX` tunes the application connection pool; serverless deployments should use a provider's pooled connection endpoint.

## Account Scoping

The welcome page supports email/password registration and login. New accounts must verify their email before signing in; after following the link, they are signed in and sent to `/home`. The dashboard and metrics API derive the user ID from the validated Better Auth session. Migration `004_auth.sql` preserves existing user IDs and data, but existing users do not automatically gain credentials or verified status.

## CSV Import Format

The Import data page accepts CSV files with the following columns. The last column is optional:

```text
date,steps,moveCalories,restMinutes,breatheMinutes,readinessScore
```

Each row belongs to the calendar date supplied by the source. Enter a local YYYY-MM-DD date, including for historical records after travel. The importer does not shift a row to the server timezone or infer how to split a session crossing midnight. Supply daily totals for steps (count), move (active kcal), rest and breathwork (minutes, 0–1440 each). Rest is the source's recorded rest time; it does not imply measured sleep. The four totals are required: zero means an observed zero. Leave an unknown readiness score blank or omit its column. A supplied 0–100 score comes from the source and is displayed with its origin. Baseline does not calculate a readiness score.

CSV rows store totals without creating event details. The import preview identifies the destination account. Any duplicate date rejects the entire batch. To transfer totals previously saved by this browser, open **Import earlier browser data**, preview them and confirm the account. The original browser copy is retained. Existing database rows and any earlier contribution history are preserved by migration 005. Before reverting to a schema that requires scores, review missing scores explicitly; assigning zero would change their meaning.

## Apple Health Import

The Import data page leads with Apple Health, with illustrated steps for getting the export off an iPhone (Health, profile picture, Export All Health Data, then AirDrop or Save to Files). You can drag the `apple_health_export` folder onto the page, pick it with Choose folder, or choose `export.zip` or `export.xml` directly. On an iPhone or iPad, where browsers can't pick folders, choose the zip from Files. The file is read in the browser, a piece at a time, so a several-hundred-megabyte export is fine and the raw health data never leaves your computer. Only the daily totals are sent to the server, in batches of 1,000 days.

How the totals are worked out:

- **Steps** come from `StepCount` records. The iPhone and Apple Watch both count the same walk and the export keeps both copies, so for each day the Watch's count is used if there is one, otherwise the iPhone's, otherwise the app that recorded the most.
- **Move** is the Activity ring total from `ActivitySummary` when the day has one. Otherwise it's `ActiveEnergyBurned` from one device, picked the same way as steps. kJ is converted to kcal, and Cal is treated as kcal. Resting energy (`BasalEnergyBurned`) is left out. A ring of 0 with no energy records usually means the Watch wasn't worn, so that day gets no move total.
- **Rest** is time asleep from `SleepAnalysis`: Core, Deep, REM, and the older plain "Asleep" value. In Bed and Awake don't count. Segments less than four hours apart are treated as one night, and the night counts toward the day you woke up. If a sleep app and the Watch both tracked the night, the Watch wins.
- **Breathwork** is `MindfulSession` time. Sessions from different apps are added together, with any overlap counted once.

Every record carries its own UTC offset, and its day is the local date in that offset. A walk at 00:30 in Tokyo belongs to that Tokyo date even though it was still the previous day in UTC. Apple Health has no readiness score, so it stays blank. Everything else in the export (heart rate, HRV, workouts and so on) is ignored for now.

Some days won't have all four totals, for example steps but no sleep data. Migration 007 lets a total be blank for that reason. A blank total means nothing was recorded, and 0 still means a recorded zero. Blank totals are left out of averages, trends and comparisons rather than counted as 0. CSV rows still need all four totals.

The preview lists the new days, where each number came from, how many days have blank totals, and which days are already saved. Days already saved, whether they came from an earlier export, a CSV or the journal, are never overwritten, so it's safe to import a newer export that overlaps an older one. Fix a single day by hand in the journal. Apple Health rows are labeled with their own `apple_health` source, so personal comparisons only compare them with other Apple Health days.

## Development Checks

```bash
npm run lint
npx next typegen
npx tsc --noEmit
npm run test:coverage
npm run build
```

Run `npm run test:integration` with `DATABASE_URL` set to a fresh, empty disposable PostgreSQL database. The suite applies migrations 001–008 and exercises per-account reads and atomic writes.

For the browser rehearsal, use a separate freshly migrated disposable database, a local Mailpit instance, `BASELINE_MAIL_TRANSPORT=mailpit`, and a fresh `qa-<uuid>@example.test` as `BASELINE_OWNER_EMAIL`. Set both app URLs to `http://localhost:3300`. Start the app with `npm run dev -- -H 127.0.0.1 -p 3300`. Export the same fixture owner and transport in the test shell. Run `npx playwright install chromium` once, then `npm run test:e2e` (or set `PLAYWRIGHT_CHROMIUM_EXECUTABLE` to a local Chromium). It exercises verification, import, reset-link reuse, credential change and session invalidation. To run the equivalent HTTP lifecycle checks against a separate fresh fixture, set `BASELINE_API_ONLY=1` in the test shell. The database and inbox should contain synthetic records only.

Baseline is a personal software project and is not a medical device. It does not provide medical advice, diagnosis, or treatment recommendations.

## Private journal and recovery rehearsal

Settings offers password sign-in and optional Google linking. Configure the web client callback as `<BETTER_AUTH_URL>/api/auth/callback/google` and set both server-side Google variables. Verify the Baseline email and sign in again before linking. The Google account must use the same verified email. Test linking, signing out, Google sign-in, cancellation and disconnect with a dedicated owner fixture before using a real account. The implementation uses Better Auth 1.7.6, its internal account ID for unlinking, and the identity scopes openid, email and profile. See the [account linking guide](https://better-auth.com/docs/concepts/users-accounts) and [Google provider guide](https://better-auth.com/docs/authentication/google).

The daily journal uses the selected local date. A check-in may exist without totals. Leave a total blank if it wasn't recorded; a day needs at least one. Edits require the revision that was displayed, so a stale tab cannot overwrite another save. Manual corrections keep the original source and are labeled in the journal and export. Corrected imports are compared with other corrected imports. A total with underlying activities can be removed with confirmation but cannot be edited independently of its activities. The signed-in JSON download includes all saved daily totals, activity details and check-ins, including dates outside the dashboard window. Store downloaded files privately.

The check-in on each journal day uses the fields set under Settings > Daily check-in. Scores run from 1 to 5 with a short description for each number, and anything left empty is saved as not recorded rather than as a low score or a no. Hiding a field keeps its history. Deleting one removes its answers as well.

### Backup and deletion

Account deletion requires the current password and explicit confirmation. The active database removes the account, sign-in methods, sessions, daily records and check-ins. An older database snapshot can still contain those records. Before enabling backups for real data, agree on an expiry period and deletion reconciliation with the owner and configure the storage provider accordingly.

For a disposable rehearsal, use two synthetic accounts in an isolated local PostgreSQL instance. Save an offline backup before deleting the first fixture. Restore into a separate offline instance with email delivery and public access disabled. Reapply approved deletions since the snapshot using the original account UUIDs and invalidate restored sessions and outstanding verification tokens before permitting access. Verify the deleted fixture has no rows and the retained fixture still has its original totals and check-ins. Destroy the disposable backup after verification. Treat any snapshot with an unknown deletion history as unsuitable for serving user traffic.


### Private release checks

The fixture tests cover password and simulated Google sign-ins for the same user ID, cancelled consent, a mismatched email, an unverified identity, a provider identity owned by a second fixture, repeated callbacks, and unlinking. Real owner Google consent and delivery to the owner mailbox are separate acceptance steps.

Use the sample CSV in `public/examples` to exercise daily intake. The JSON API accepts up to 5 MiB per request, 5,000 dates, and 500 entries in each contribution list per day. To inspect availability locally, request the public sample dashboard, then verify that a signed-out request to `/api/export` returns 401. A signed-in read of the journal checks database availability. Keep request bodies, query strings, cookies, and export contents out of logs. For a failed release, stop the new process and start the prior application against a compatible schema. Preserve nullable scores and journal tables when rolling back application code. Restore a snapshot only into an isolated target and reconcile deletions before serving it.

The [ready task decisions](docs/ready-task-decisions.md) define manual entry, quick check-ins, comparison coverage, intake selection and data retention. Run `npm run test:local-release` for the disposable local production-mode PGlite rehearsal. PostgreSQL 16 CI remains the full database and restore check.
