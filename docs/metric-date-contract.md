# Metric and date contract

Daily records belong to an authenticated account and a local calendar date in YYYY-MM-DD format. A real calendar date is required. A date is unique within each account. The supplied date is authoritative across travel and timezone changes. The server does not convert it through UTC or redistribute a session crossing midnight. Split overnight activity into dated totals at the source before import.

## Measures

Steps are whole counts. Move is active energy in kcal. Rest and breathwork are whole minutes, each between 0 and 1440 per day. Rest describes recorded rest and must not be labeled measured sleep. Measurements collected with different methods may be incompatible even when their units match. CSV does not identify the device or measurement method, so identical entry sources alone do not establish device comparability.

CSV rows require all four totals. Since migration 007, a journal entry or an Apple Health day can leave a total blank when it wasn't recorded, as long as the day has at least one. Zero is an observed zero, and blank is unknown. Missing totals must never be silently replaced by zero, and blank totals are left out of averages, trends and comparisons. A day without a metric record is unknown.

A skipped check-in is unknown and independent of daily totals. Since migration 008 the check-in is configurable: every account starts with Energy and Soreness (scores from 1 to 5, each number with its own description) and Notes (tags plus up to 240 characters), and the owner can add their own score, yes/no and number fields. Every answer is optional, and an empty answer is stored as not recorded, never as a low score or a no.

Readiness is an optional source-supplied integer from 0 to 100. Zero is a valid score. Blank or absent readiness remains null. Baseline+ does not calculate readiness. The dashboard headline only groups the supplied score (70 and up, 50 to 69, under 50) and compares it with the 28-day median. Any future derived score needs a separate identity, algorithm version and input provenance.

## Provenance and freshness

Retain original source and creation/update timestamps. Manual corrections retain original provenance and indicate correction. Creation time records ingestion, and update time records modification. Neither proves a device observed the measurement at that instant. The latest record date indicates recency and must remain visible even for historical-only data. Avoid presenting an old date as today.

True contribution entries retain their identity and totals. Summary imports do not invent underlying activities. Each supplied contribution list must sum to the corresponding daily total. Duplicate dates reject the entire import transaction. Corrections use revision checks so stale submissions cannot overwrite newer saves.

## Comparison interpretation

Comparison coverage counts observed dates, retaining observed zero values. Missing dates are gaps. Prior 7/28-day reference windows exclude the selected anchor date and require at least 4/14 comparable observed dates. Comparisons use medians. A weekly recap uses the seven days ending on the selected record date and the preceding seven days, requiring four observations in each. Display dates, units, counts, gaps and source limitations alongside claims. Optional context coverage never converts skipped ratings into zero or a health conclusion.

Originally verified against the merged M02–M05 implementation in PRs 5 and 6, and updated on 28 November 2026 for blank totals (PR 10) and configurable check-ins (PRs 14 and 15). Further device connectors must provide explicit method and timezone metadata before cross-device comparisons can be claimed.
