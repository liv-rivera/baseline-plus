# Private build acceptance

The canonical repository is https://github.com/liv-rivera/baseline-plus. Use baseline-plus-repo as the local checkout. Historical copies and local-only email-testing work are preserved under the adjacent repo-archive folder. The historical feat/create-login branch is retained. Its verification resend used direct client calls and development-copy differences. Main shares the server account sender and recovery form, with neutral responses, an owner allowlist and throttled endpoints. The old form should not replace the current accepted login design.

## Data and comparisons

The metric/date contract is in metric-date-contract.md. Migration 005 changes only readiness nullability and preserves original IDs and values. Migration 006 adds separate account/date check-ins, explicit correction provenance and reset-token cleanup on account removal. Apply these in order after 001–004. Roll back application code against a compatible schema. Keep journal tables and nullable values intact. To revert schema, first export and explicitly resolve missing scores and check-ins. Assigning zero changes unknown data.

The browser intake supports the existing template and public/examples/synthetic-daily-totals.csv. Four whole-number totals are required. Readiness is optional. Preview confirms the destination account. Duplicate dates reject the whole transaction. Legacy browser transfers require a fresh account-bound preview and retain the original browser copy.

Personal reference medians use the 7 or 28 calendar days before the selected record date with 4 or 14 observations required. The selected date is excluded from its baseline. Weekly medians use the seven days ending at the selected record date and the preceding seven days, with four observed dates required in each. Missing context stays missing. A CSV source does not establish device identity. Corrected imports and untouched imports are separate comparison groups. The read-only sample dashboard contains fictional data outside every account.

## Running reproducible checks

Use Node 22.12 or later and npm ci with the committed lockfile. Copy .env.example locally and generate a private 32-character or longer secret. Use only a disposable loopback database for tests. Never put an account password, email action URL or secret into a report.

Run npm run lint, npx next typegen, npx tsc --noEmit, npm run test:coverage and npm run build. Run npm run test:integration with a new empty DATABASE_URL. The suite applies migrations 001–006, checks an existing pre-005 zero score, loads the synthetic seed and exercises owner-specific writes, concurrent check-ins, Google callback fixtures, exports and dependent deletion.

For a complete disposable browser and HTTP rehearsal, start Mailpit on 127.0.0.1:8025 and SMTP 127.0.0.1:1025. Install Playwright Chromium and PostgreSQL client utilities. Set BASELINE_REHEARSAL=synthetic and BASELINE_QA_ADMIN_URL to a loopback PostgreSQL administrative connection with CREATE DATABASE permission, then run npm run test:private-rehearsal. The runner creates databases with unique generated names, applies every migration, generates fixture credentials and tests signup, verification, journal edits, browser migration, reset, token reuse, sign-out, responsive layouts and keyboard navigation. The snapshot is created only from synthetic records and restored into another generated database. Reconciliation removes the deleted owner, clears recovered sessions and outstanding verification tokens, and preserves the second fixture. Cleanup removes only the databases created by that run and its temporary backup.

GitHub Actions runs the same checks and the private account rehearsal against PostgreSQL 16. Email capture is restricted to loopback. Production rejects Mailpit, so the production build check and development email-capture rehearsal are distinct checks.

## Remaining owner acceptance

Google client registration requires the owner’s Google Cloud project. Use only openid, email and profile and register the exact callback shown in README. Live Google consent and receipt in the owner mailbox remain separate acceptance tasks. Synthetic callback and Mailpit tests do not establish either result. Real-data backup retention must be agreed and configured before enabling real-data backups. This rehearsal retains no real-data snapshots and adds no recurring service.
