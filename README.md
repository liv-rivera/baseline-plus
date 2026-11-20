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
npm run db:seed
```

The seed moves the existing three dashboard records and their contribution details into PostgreSQL. No metric values are embedded in the running application.

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

Chart queries read a bounded window of recent records; averages are computed in PostgreSQL across the user's full history. Imports are validated on the server and inserted in a transaction. If any date already exists, the whole batch is rejected. `DATABASE_POOL_MAX` tunes the application connection pool; serverless deployments should use a provider's pooled connection endpoint.

## Account Scoping

The welcome page supports email/password registration and login. New accounts must verify their email before signing in; after following the link, they are signed in and sent to `/home`. The dashboard and metrics API derive the user ID from the validated Better Auth session. Migration `004_auth.sql` preserves existing user IDs and data, but existing users do not automatically gain credentials or verified status.

## CSV Import Format

The Import data page accepts CSV files with the following columns. The last column is optional:

```text
date,steps,moveCalories,restMinutes,breatheMinutes,readinessScore
```

Each row belongs to the calendar date supplied by the source. Enter a local YYYY-MM-DD date, including for historical records after travel. The importer does not shift a row to the server timezone or infer how to split a session crossing midnight. Supply daily totals for steps (count), move (active kcal), rest and breathwork (minutes, 0–1440 each). Rest is the source's recorded rest time; it does not imply measured sleep. The four totals are required: zero means an observed zero. Leave an unknown readiness score blank or omit its column. A supplied 0–100 score comes from the source and is displayed with its origin. Baseline does not calculate a readiness score.

CSV rows store totals without creating event details. The import preview identifies the destination account. Any duplicate date rejects the entire batch. To transfer totals previously saved by this browser, open **Import earlier browser data**, preview them and confirm the account. The original browser copy is retained. Existing database rows and any earlier contribution history are preserved by migration 005. Before reverting to a schema that requires scores, review missing scores explicitly; assigning zero would change their meaning.

## Development Checks

```bash
npm run lint
npx next typegen
npx tsc --noEmit
npm run test:coverage
npm run build
```

Run `npm run test:integration` with `DATABASE_URL` set to a fresh, empty disposable PostgreSQL database. The suite applies migrations 001–005 and exercises per-account reads and atomic writes.

For the browser rehearsal, use a separate freshly migrated disposable database, a local Mailpit instance, `BASELINE_MAIL_TRANSPORT=mailpit`, and a fresh `qa-<uuid>@example.test` as `BASELINE_OWNER_EMAIL`. Set both app URLs to `http://localhost:3300`. Start the app with `npm run dev -- -H 127.0.0.1 -p 3300`. Export the same fixture owner and transport in the test shell. Run `npx playwright install chromium` once, then `npm run test:e2e` (or set `PLAYWRIGHT_CHROMIUM_EXECUTABLE` to a local Chromium). It exercises verification, import, reset-link reuse, credential change and session invalidation. To run the equivalent HTTP lifecycle checks against a separate fresh fixture, set `BASELINE_API_ONLY=1` in the test shell. The database and inbox should contain synthetic records only.

Baseline is a personal software project and is not a medical device. It does not provide medical advice, diagnosis, or treatment recommendations.
