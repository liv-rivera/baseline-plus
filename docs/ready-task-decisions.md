# Ready task decisions

This record covers the nine tasks selected from the dashboard on 26 November 2026. Code and fixture evidence live on the ongoing private-build acceptance branch.

## T050 Mobile daily entry and corrections

The journal opens a chosen local calendar date. The date picker initially uses the browser’s calendar date. It never silently shifts an imported date through the server timezone.

| Input | Requirement | Validation |
| --- | --- | --- |
| Date | Required | A real YYYY-MM-DD calendar date |
| Steps | Required daily total | Whole count from 0 to 2147483647 |
| Move | Required daily total | Whole active kcal from 0 to 2147483647 |
| Rest | Required daily total | Whole minutes from 0 to 1440 |
| Breathwork | Required daily total | Whole minutes from 0 to 1440 |

A blank amount is unknown and cannot be saved as zero. Manual entry creates a source-labeled total with no readiness score. Correcting an imported summary preserves its original source and supplied score and adds a correction flag. Detailed days display their stored totals. Editing a summary with underlying activities is blocked. Removing that day requires the dated confirmation checkbox and cascades to its real contributions.

Save disables its button during the request and reports success or a recoverable error beside the form. A revision mismatch requires a reload. It cannot overwrite another tab’s save. Totals and context use separate forms and separate removal confirmations. Controls fit a phone viewport, use explicit labels and retain visible keyboard focus.

## T054 Quick daily check-in

Energy and soreness are independent optional ratings from 1 to 5, with 1 low and 5 high. A private note of up to 240 characters is optional. This release uses the short note for free-form context. Tags can wait until a concrete use emerges.

A person can skip the whole check-in by leaving the form alone. Creating a check-in requires at least one rating or a nonempty note. Skipped ratings remain null. A check-in can exist on a day without metric totals. An existing check-in is edited in place, and removal requires its own confirmation. Clearing every field does not silently delete it. Recent dated entries link back to the editable day. The dashboard shows saved ratings and links to the full journal without displaying private note text in recap facts or operational logs.

## T061 Personal windows and coverage

The anchor is the selected latest record date, including a historical date. The prior baseline excludes that date. A seven-day baseline covers anchor minus seven through anchor minus one and requires four observations. A 28-day baseline covers anchor minus 28 through anchor minus one and requires fourteen observations.

The latest week covers anchor minus six through anchor. The previous week covers anchor minus thirteen through anchor minus seven. Each week requires four observations before a median change is stated. These are calendar windows with inclusive endpoints. Gaps stay gaps, and an observed zero participates in the median. Sort observations by value and use the middle value, or the mean of the two middle values, to obtain the median. Median calculations can yield half-unit values even though daily input accepts only integers.

Eligible observations share the anchor’s entry source. Corrected imports and untouched imports form separate groups. Manual observations remain comparable across corrections. Source labels identify the entry method. CSV data has no device identifier, so the interface cannot infer whether two imported files used the same device or measurement method. Device comparisons require additional provenance later.

Show the selected date, metric units, comparison range, eligible count, gaps and contributing-day links. Sparse coverage produces explanatory text. Check-in coverage counts saved context only among eligible metric dates. A context-only day has no measured metric value to contribute. The recap describes an association in recorded data and makes no medical or causal claim.

## T171 Available intake assessment and T060 template verification

The project contains the supported CSV template, the synthetic daily-totals example and legacy browser totals. No owner device export was supplied for this review. The selected intake is the existing CSV/manual fallback. It costs no additional subscription, needs no provider API scopes or approval, and creates no device connection.

The file maps date to the supplied local date, steps to counts, moveCalories to active kcal, and restMinutes and breatheMinutes to minutes. The optional readinessScore is an externally supplied 0–100 score. Empty readiness stays null. Imports create summaries and preserve genuine activity details already stored elsewhere. The sample is fictional and carries no personal measurements.

Before saving, the preview names its destination account. A changed account invalidates that preview. Every row must pass validation. Duplicate dates block the entire batch. A user can clear a preview before saving, remove saved dates afterward, or export and delete the account. Earlier browser totals are transferred only after explicit preview, and the original browser copy is retained.

The browser rehearsal times the supported synthetic intake from opening Import data to reading the saved dashboard. It runs with a Honolulu browser timezone against a UTC CI host, confirms the original calendar date, rejects a repeated file and a malformed header, and verifies the saved record count stays unchanged. The time printed by CI measures the automated fixture workflow. It does not measure a person’s familiarity with the app.

## T078 Data retention and deletion rules

| Data | Retention rule | Removal and restore behavior |
| --- | --- | --- |
| Account identity, credential and sign-in method rows | Retained while the account or method exists | Account deletion requires the current password and confirmation. Foreign keys remove sessions, account methods and owned records. Disconnecting Google removes its local method and token rows. Provider-side consent is managed in the Google account. |
| Daily totals and real contributions | Retained until the owner removes the date or account | Dated removal cascades to its contributions. Removing totals keeps an independent check-in unless it is separately removed. |
| Ratings and private notes | Retained until the check-in or account is removed | Removal is scoped to the authenticated account and date. Notes are included only in its authorized export and journal. |
| Sessions | Access ends at expires_at, sign-out, password reset or account deletion | Expiration is enforced on reads. Timed physical purging is currently owner-managed. A recovered database clears every restored session before access resumes. |
| Verification and OAuth state rows | Access is limited by the stored expiry or token expiry | Reset tokens are single-use, and account deletion clears its reset-token rows. Expired rows can remain physically stored until maintenance or a disposable database reset. A recovered database clears outstanding verification rows before access resumes. |
| Operational output | The app creates no persistent log files or analytics store | Exclude request bodies, credentials, cookies, action URLs, notes and metric values. Hosted CI captures synthetic test output under repository log retention. The existing coverage artifact expires after 14 days. Review hosted log retention before using real-data operational logs. |
| Rehearsal snapshots | Synthetic data only, in a run-specific temporary directory | The runner deletes its snapshots and generated databases in cleanup. Restore into an isolated target, reconcile deletions after the snapshot, clear recovered authentication state, then verify the retained account before exposing access. |
| Owner downloads | Controlled by the owner after download | Account deletion cannot remove copies already downloaded outside the app. |

Private-build automation creates zero backups of real account data. Enabling real-data backups requires an explicit owner choice of storage, expiry and deletion reconciliation. Any provider-managed snapshot policy remains an open release prerequisite. A shorter physical retention guarantee for expired authentication rows also needs a scheduled maintenance policy before it can be promised.

## T163 Session boundaries and T086 local release environment

The PostgreSQL integration suite uses two synthetic accounts with overlapping dates. It checks signed-out reads, account-specific reads, mismatched preview owners, actual session expiration, sign-out and closed registration. The browser rehearsal checks the protected dashboard redirects after access is revoked.

Run npm run test:local-release to build and run the production-mode app on 127.0.0.1:3317 with a disposable in-memory PGlite database on 127.0.0.1:35471. The runner loads all six migrations, generates fixture credentials and a fresh auth secret, closes registration and external email sending, and checks two-account isolation and dashboard/API access before and after expiry and sign-out. It respects production authentication throttles. Credentials and database contents are discarded after the run. It uses an isolated process environment and changes no local account configuration.

The Mac execution sandbox rejects native PostgreSQL shared-memory creation. PGlite provides a PostgreSQL WASM development backend for this local check. It is a single-connection fixture environment with DATABASE_POOL_MAX=1 and is a development dependency. The standard private account rehearsal continues to use PostgreSQL 16 in CI for migrations, concurrent writes, browser intake, backups, deletion reconciliation and rollback. This records the local release check’s limits and keeps the existing database integration coverage.

The fixture backend follows the [PGlite socket documentation](https://pglite.dev/docs/pglite-socket).
