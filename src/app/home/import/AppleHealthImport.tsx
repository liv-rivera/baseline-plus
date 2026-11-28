"use client";

import { useRef, useState, type ChangeEvent, type DragEvent } from "react";
import Link from "next/link";
import type { AppleHealthDay, AppleHealthVitals } from "@/lib/appleHealth/collector";
import {
  AppleHealthFileError,
  exportFromDrop,
  exportFromFolderSelection,
  readAppleHealthExport,
} from "@/lib/appleHealth/readExport";
import { HealthExportGuide } from "./HealthExportGuide";
import styles from "./page.module.css";

// The metrics API takes up to 5,000 days and 5 MiB per request. A day of
// totals is under 300 bytes, so 1,000 days keeps each request well inside both.
const BATCH_SIZE = 1000;
const PREVIEW_ROWS = 60;

type Props = {
  ownerId: string | undefined;
  ownerEmail: string | undefined;
  savedDates: Set<string>;
  disabled: boolean;
  onImported: () => void;
};

type Preview = { sourceName: string; newDays: AppleHealthDay[]; alreadySaved: string[]; vitals: AppleHealthVitals[] };

const show = (value: number | null) => (value === null ? "—" : value.toLocaleString("en-US"));
const isPartial = (day: AppleHealthDay) =>
  day.steps === null || day.moveCalories === null || day.restMinutes === null || day.breatheMinutes === null;

export function AppleHealthImport({ ownerId, ownerEmail, savedDates, disabled, onImported }: Props) {
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewOwner, setPreviewOwner] = useState("");
  const [pending, setPending] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const selection = useRef(0);

  const [dragging, setDragging] = useState(false);

  const start = () => {
    const version = ++selection.current;
    setPreview(null);
    setError("");
    setSuccessMessage("");
    setStatus("");
    return version;
  };

  const fail = (version: number, readError: unknown) => {
    if (version !== selection.current) return;
    setStatus("");
    setError(readError instanceof AppleHealthFileError ? readError.message : "This export couldn't be read.");
  };

  const readExport = async (version: number, file: File, sourceName: string) => {
    if (!ownerId) return;
    setPreviewOwner(ownerId);
    setStatus("Reading your export…");
    try {
      const summary = await readAppleHealthExport(file, (fraction) => {
        if (version === selection.current) setStatus(`Reading your export… ${Math.round(fraction * 100)}%`);
      });
      if (version !== selection.current) return;
      const newDays = summary.days.filter((day) => !savedDates.has(day.date));
      const alreadySaved = summary.days.filter((day) => savedDates.has(day.date)).map((day) => day.date);
      // Heart readings are saved for every day, including days whose totals are already
      // saved, so a newer export can fill them in.
      const vitals = summary.vitals ?? [];
      setStatus("");
      if (!newDays.length && !vitals.length) {
        setError("Every day in this export is already saved. Nothing new to add.");
        return;
      }
      setPreview({ sourceName, newDays, alreadySaved, vitals });
    } catch (readError) {
      fail(version, readError);
    }
  };

  const handleFolder = (event: ChangeEvent<HTMLInputElement>) => {
    const version = start();
    const files = Array.from(event.target.files ?? []);
    // Clear the input so choosing the same folder again (say, after importing it) still triggers a read.
    event.target.value = "";
    if (!files.length) return;
    try {
      const xml = exportFromFolderSelection(files);
      void readExport(version, xml, (xml.webkitRelativePath || xml.name).split("/")[0]);
    } catch (folderError) {
      fail(version, folderError);
    }
  };

  const handleFile = (event: ChangeEvent<HTMLInputElement>) => {
    const version = start();
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) void readExport(version, file, file.name);
  };

  const handleDrop = async (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    if (disabled || pending) return;
    const version = start();
    try {
      const file = await exportFromDrop(event.dataTransfer);
      await readExport(version, file, file.webkitRelativePath?.split("/")[0] || file.name);
    } catch (dropError) {
      fail(version, dropError);
    }
  };

  const handleImport = async () => {
    if (!preview || pending || !ownerId || ownerId !== previewOwner) return;
    setPending(true);
    setError("");
    let inserted = 0;
    const skipped: string[] = [];
    try {
      for (let start = 0; start < preview.newDays.length; start += BATCH_SIZE) {
        const batch = preview.newDays.slice(start, start + BATCH_SIZE).map((day) => ({
          date: day.date,
          source: "apple_health",
          steps: day.steps,
          moveCalories: day.moveCalories,
          restMinutes: day.restMinutes,
          breatheMinutes: day.breatheMinutes,
          readinessScore: null,
          activities: [],
          stepActivities: [],
          restPeriods: [],
          breathworkSessions: [],
        }));
        const response = await fetch("/api/metrics?existing=skip", {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Baseline-Preview-Owner": previewOwner },
          body: JSON.stringify(batch),
        });
        const result = await response.json() as { inserted?: number; skipped?: string[]; error?: string };
        if (!response.ok) throw new Error(result.error ?? "The days could not be imported.");
        inserted += result.inserted ?? 0;
        skipped.push(...(result.skipped ?? []));
      }
      let heartDays = 0;
      for (let start = 0; start < preview.vitals.length; start += BATCH_SIZE) {
        const response = await fetch("/api/vitals", {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Baseline-Preview-Owner": previewOwner },
          body: JSON.stringify(preview.vitals.slice(start, start + BATCH_SIZE)),
        });
        const result = await response.json() as { saved?: number; error?: string };
        if (!response.ok) throw new Error(result.error ?? "The heart readings could not be saved.");
        heartDays += result.saved ?? 0;
      }
      const keptCount = skipped.length + preview.alreadySaved.length;
      setSuccessMessage(
        `Added ${inserted.toLocaleString("en-US")} ${inserted === 1 ? "day" : "days"} from Apple Health.`
        + (heartDays ? ` Saved HRV and resting heart rate for ${heartDays.toLocaleString("en-US")} ${heartDays === 1 ? "day" : "days"}.` : "")
        + (keptCount === 1 ? " 1 day was already saved and left as it was." : "")
        + (keptCount > 1 ? ` ${keptCount.toLocaleString("en-US")} days were already saved and left as they were.` : ""),
      );
      setPreview(null);
      onImported();
    } catch (importError) {
      const message = importError instanceof Error ? importError.message : "The days could not be imported.";
      setError(inserted ? `${message} ${inserted} days were added before this stopped. Choose the file again to add the rest.` : message);
      if (inserted) {
        setPreview(null);
        onImported();
      }
    } finally {
      setPending(false);
    }
  };

  const partialCount = preview?.newDays.filter(isPartial).length ?? 0;
  const newestFirst = preview ? [...preview.newDays].reverse().slice(0, PREVIEW_ROWS) : [];

  return (
    <section className={styles.importPanel} aria-labelledby="apple-health-title">
      <div className={styles.panelHeading}>
        <div>
          <p className={styles.eyebrow}>APPLE HEALTH</p>
          <h2 id="apple-health-title">Import from Apple Health</h2>
        </div>
      </div>

      <p className={styles.panelIntro}>
        Bring in your steps, move, sleep, mindful minutes, HRV and resting heart rate straight from the export the Health app makes. It
        takes a couple of minutes on your iPhone, then one drag here.
      </p>

      <HealthExportGuide />

      <div
        className={`${styles.dropZone} ${dragging ? styles.dropZoneActive : ""}`}
        onDragOver={(event) => {
          event.preventDefault();
          if (!disabled && !pending) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        aria-busy={Boolean(status)}
      >
        <p className={styles.dropTitle}>{preview?.sourceName ?? "Drop the apple_health_export folder here"}</p>
        <p className={styles.dropHelp}>
          {status || "Or the export.zip itself. It's read here in your browser, and only the daily totals are sent to Baseline."}
        </p>
        {status && <span className={styles.progressBar} aria-hidden="true" />}
        <div className={styles.dropActions}>
          <label className={`button ${styles.pickButton}`} aria-disabled={disabled || pending}>
            Choose folder
            <input
              type="file"
              aria-label="Apple Health export folder"
              multiple
              // Lets the person pick the whole apple_health_export folder.
              {...{ webkitdirectory: "", directory: "" }}
              onChange={handleFolder}
              disabled={disabled || pending}
            />
          </label>
          <label className={`button-secondary ${styles.pickButton}`} aria-disabled={disabled || pending}>
            Choose export.zip
            <input
              type="file"
              aria-label="Apple Health export.zip"
              accept=".zip,.xml,application/zip,text/xml,application/xml"
              onChange={handleFile}
              disabled={disabled || pending}
            />
          </label>
        </div>
        <p className={styles.dropHint}>On an iPhone or iPad, use Choose export.zip and pick the file from Files.</p>
      </div>

      <details className={styles.formatInfo}>
        <summary>What gets imported</summary>
        <p>
          Steps, active energy, sleep (Core, Deep and REM) and mindful minutes, added up by the
          local date on each record. HRV (SDNN) and resting heart rate are averaged for each day
          from one device, and are used by the check-in questions. When your iPhone and Apple Watch both counted steps, the
          Watch&apos;s count is used. A night of sleep counts toward the day you woke up. If a day
          has no sleep or mindful data, that total is left blank instead of being saved as 0.
          Days you&apos;ve already saved are skipped, so you can import a newer export any time.
          Heart readings are the exception: they&apos;re filled in for saved days too.
        </p>
      </details>

      {error && (
        <div className={styles.errorBox} role="alert">
          <h3>Export needs attention</h3>
          <ul><li>{error}</li></ul>
        </div>
      )}

      {preview && (
        <div className={styles.preview}>
          <div className={styles.previewHeading}>
            <div>
              <h3>Ready to import</h3>
              <p>
                {preview.newDays.length.toLocaleString("en-US")} new {preview.newDays.length === 1 ? "day" : "days"} for {ownerEmail}.
                {partialCount > 0 && ` ${partialCount.toLocaleString("en-US")} have one or more blank totals.`}
                {preview.alreadySaved.length > 0 && ` ${preview.alreadySaved.length.toLocaleString("en-US")} already saved and will be skipped.`}
                {preview.vitals.length > 0 && ` HRV or resting heart rate for ${preview.vitals.length.toLocaleString("en-US")} ${preview.vitals.length === 1 ? "day" : "days"}.`}
              </p>
            </div>
            <button className={styles.importButton} type="button" onClick={handleImport} disabled={pending || ownerId !== previewOwner}>
              {pending ? "Adding…" : preview.newDays.length ? "Add days" : "Add heart readings"}
            </button>
          </div>
          <div className={styles.tableWrap}>
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Steps</th>
                  <th>Move kcal</th>
                  <th>Rest min</th>
                  <th>Breathwork min</th>
                  <th>From</th>
                </tr>
              </thead>
              <tbody>
                {newestFirst.map((day) => (
                  <tr key={day.date}>
                    <td>{day.date}</td>
                    <td>{show(day.steps)}</td>
                    <td>{show(day.moveCalories)}</td>
                    <td>{show(day.restMinutes)}</td>
                    <td>{show(day.breatheMinutes)}</td>
                    <td>{[...new Set(Object.values(day.sources).flatMap((source) => source.split(", ")))].join(", ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {preview.newDays.length > PREVIEW_ROWS && (
            <p className={styles.previewNote}>Showing the latest {PREVIEW_ROWS} of {preview.newDays.length.toLocaleString("en-US")} days.</p>
          )}
          {preview.alreadySaved.length > 0 && (
            <details className={styles.previewNote}>
              <summary>Days already saved ({preview.alreadySaved.length})</summary>
              <p>{preview.alreadySaved.join(", ")}</p>
            </details>
          )}
        </div>
      )}

      {successMessage && (
        <p className={styles.successMessage} role="status">
          {successMessage} <Link href="/home">View dashboard</Link>
        </p>
      )}
    </section>
  );
}
