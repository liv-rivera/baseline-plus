# Importing from Apple Health

Baseline+ can read the export file the Health app makes on your iPhone. You can import your whole history in one go, and import again whenever you want to bring things up to date.

## 1. Export from your iPhone

1. Open the **Health** app and tap your profile picture at the top right.
2. Scroll to the very bottom and tap **Export All Health Data**.
3. Tap **Export** to confirm. If you have years of data this can take a few minutes, so keep the Health app open while it works.
4. When the share sheet appears, AirDrop the file to your Mac or save it to iCloud Drive in Files.

The file is called `export.zip`. On a Mac, opening it gives you a folder called `apple_health_export`.

## 2. Import it into Baseline+

Go to **Import**. Apple Health is the first section. You can do any of these:

- Drag the `apple_health_export` folder onto the page.
- Use **Choose folder** and pick that folder.
- Choose `export.zip` or `export.xml` directly.

On an iPhone or iPad, browsers can't pick folders, so choose `export.zip` from Files.

Big exports are fine. Baseline+ reads the file in your browser a piece at a time, and the raw file never leaves your device. Only the daily totals it works out are sent to your account.

## 3. Check the preview, then import

Before anything is saved you'll see a preview. It lists the new days it found, where each number came from, how many days are missing a total, and which days you already have. If it all looks right, confirm the import and you'll see the result on your dashboard.

## What gets imported

For each day, Baseline+ takes four totals:

- **Steps.** Your iPhone and Apple Watch both count the same walk, so Baseline+ uses the Watch's count when there is one, otherwise the iPhone's. Nothing is counted twice.
- **Move.** Your Activity ring calories when you have them, otherwise active energy from one device. Resting calories aren't included. A ring of zero with nothing else recorded usually means the Watch wasn't worn, so that day is left blank instead of showing zero.
- **Rest.** Time asleep from sleep tracking. Time in bed and time awake don't count. A night of sleep counts toward the day you woke up.
- **Breathwork.** Mindful minutes, added up across apps without counting any overlap twice.

Each day uses the local time where you were, so trips across time zones land on the right dates.

Heart rate, HRV, workouts and everything else in the export are skipped for now. Apple Health also doesn't have a readiness score, so imported days won't show one.

## Missing totals

Some days won't have all four numbers, for example steps but no sleep. Those totals are left blank, which means "not recorded", and they're left out of averages and comparisons instead of being counted as zero. A real zero stays a zero.

## Importing again later

Days you already have are never overwritten, whether they came from an earlier export, a spreadsheet or the journal. So you can import a newer export whenever you like, and only the new days get added. If one day's numbers are wrong, fix it by hand in the **Journal**.

## Using a spreadsheet instead

Below Apple Health there's a CSV import for spreadsheet data. It needs these columns, with the last one optional:

```text
date,steps,moveCalories,restMinutes,breatheMinutes,readinessScore
```

Dates are YYYY-MM-DD. Each row needs all four totals, and if any date in the file is already saved, the whole file is turned away so you can fix it and try again.
