"use client";

import { useRef, useState, type ChangeEvent } from "react";
import { authClient } from "@/lib/auth-client";
import Papa from "papaparse";
import Link from "next/link";
import { useDailyMetrics } from "@/lib/useDailyMetrics";
import type { DailyMetrics } from "@/types/metrics";
import {
  requiredCsvHeaders,
  templateHeaders,
  validateAndParseCsvRows,
  validateCsvHeaders,
} from "@/lib/csvImportValidation";
import { AppleHealthImport } from "./AppleHealthImport";
import styles from "./page.module.css";

const downloadTemplate = () => {
  const csv = `${templateHeaders.join(",")}\n`;
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "baseline-metrics-template.csv";
  link.click();
  URL.revokeObjectURL(url);
};

export default function ImportDataPage() {
  const {
    metrics: existingMetrics,
    loading,
    error: databaseError,
    refresh,
  } = useDailyMetrics();
  const [selectedFile, setSelectedFile] = useState("");
  const [preview, setPreview] = useState<DailyMetrics[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [successMessage, setSuccessMessage] = useState("");

  const [parsing, setParsing] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const submitting = useRef(false);
  const [pending, setPending] = useState(false);

  const { data: session } = authClient.useSession();
  const [previewOwner, setPreviewOwner] = useState("");
  const [previewEmail, setPreviewEmail] = useState("");

  const selectionVersion = useRef(0);

  const previewBrowserTotals = () => {
    selectionVersion.current++;
    setParsing(false);
    if (fileInput.current) fileInput.current.value = "";
    setErrors([]);
    setPreview([]);
    setSuccessMessage("");
    setSelectedFile("");
    if (!session) return;
    setPreviewOwner(session.user.id);
    setPreviewEmail(session.user.email);
    try {
      const saved = JSON.parse(
        localStorage.getItem("baseline.importedMetrics.v1") ?? "[]",
      ) as unknown;
      if (!Array.isArray(saved) || !saved.length) {
        setErrors(["No saved daily totals were found in this browser."]);
        return;
      }
      const rows = saved.map((record) =>
        Object.fromEntries(
          templateHeaders.map((key) => [key, String(record[key] ?? "")]),
        ),
      );
      const result = validateAndParseCsvRows(
        rows,
        new Set(existingMetrics.map((record) => record.date)),
      );
      if (result.errors.length) setErrors(result.errors.slice(0, 10));
      else setPreview(result.parsedMetrics);
    } catch {
      setErrors([
        "Could not read this browser’s saved totals. The local copy is still available.",
      ]);
    }
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const version = ++selectionVersion.current;
    const file = event.target.files?.[0];
    setPreviewOwner(session?.user.id ?? "");
    setPreviewEmail(session?.user.email ?? "");
    setParsing(false);
    setPreview([]);
    setErrors([]);
    setSuccessMessage("");
    setSelectedFile(file?.name ?? "");

    if (!file) {
      return;
    }

    if (!file.name.toLowerCase().endsWith(".csv")) {
      setErrors(["Choose a CSV file to continue."]);
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setErrors([
        "This file is larger than 5 MiB. Split it into smaller CSV files and try again.",
      ]);
      return;
    }

    setParsing(true);
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: "greedy",
      transformHeader: (header) => header.trim(),
      complete: (result) => {
        if (version !== selectionVersion.current) return;
        setParsing(false);
        const validationErrors: string[] = [];
        const fields = result.meta.fields ?? [];
        validationErrors.push(...validateCsvHeaders(fields));

        if (result.errors.length) {
          validationErrors.push(
            ...result.errors
              .slice(0, 5)
              .map(
                (error) =>
                  `CSV parse error${error.row === undefined ? "" : ` on row ${error.row + 2}`}: ${error.message}`,
              ),
          );
        }

        const existingDates = new Set(
          existingMetrics.map((metric) => metric.date),
        );
        const { errors: rowErrors, parsedMetrics } = validateAndParseCsvRows(
          result.data,
          existingDates,
        );
        validationErrors.push(...rowErrors);

        if (!result.data.length) {
          validationErrors.push("The CSV has a header but no data rows.");
        }

        if (validationErrors.length) {
          setErrors(validationErrors.slice(0, 10));
          return;
        }

        setPreview(parsedMetrics);
      },
      error: (error) => {
        if (version === selectionVersion.current) {
          setParsing(false);
          setErrors([`Could not read the CSV file: ${error.message}`]);
        }
      },
    });
  };

  const handleImport = async () => {
    if (
      submitting.current ||
      parsing ||
      !preview.length ||
      !previewOwner ||
      session?.user.id !== previewOwner
    )
      return;
    submitting.current = true;
    const destination = previewEmail;
    setPending(true);
    setErrors([]);
    try {
      const response = await fetch("/api/metrics", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Baseline-Preview-Owner": previewOwner,
        },
        body: JSON.stringify(preview),
      });
      const result = (await response.json()) as {
        inserted?: number;
        error?: string;
      };
      if (!response.ok) {
        throw new Error(result.error ?? "The records could not be imported.");
      }

      setSuccessMessage(
        `${result.inserted ?? preview.length} ${preview.length === 1 ? "record" : "records"} added to ${destination}.`,
      );
      setPreview([]);
      setSelectedFile("");
      if (fileInput.current) fileInput.current.value = "";
      refresh();
    } catch (importError) {
      setErrors([
        importError instanceof Error
          ? importError.message
          : "The records could not be imported.",
      ]);
    } finally {
      submitting.current = false;
      setPending(false);
    }
  };

  function clearPreview() {
    selectionVersion.current++;
    setParsing(false);
    setPreview([]);
    setErrors([]);
    setSuccessMessage("");
    setSelectedFile("");
    if (fileInput.current) fileInput.current.value = "";
  }

  return (
    <main className={styles.page}>
      <div className={styles.content}>
        <Link className={styles.backLink} href="/home">
          Back to dashboard
        </Link>

        <header className={styles.header}>
          <p className={styles.eyebrow}>DATA MANAGEMENT</p>
          <h1>Import data</h1>
          <p className={styles.description}>
            Add daily metric records to your existing Baseline data.
          </p>
        </header>

        <AppleHealthImport
          ownerId={session?.user.id}
          ownerEmail={session?.user.email}
          savedDates={new Set(existingMetrics.map((metric) => metric.date))}
          disabled={!session || loading || Boolean(databaseError)}
          onImported={refresh}
        />

        <section
          aria-busy={pending || parsing}
          className={styles.importPanel}
          aria-labelledby="upload-title"
        >
          <div className={styles.panelHeading}>
            <div>
              <p className={styles.eyebrow}>CSV FILE</p>
              <h2 id="upload-title">Choose a data file</h2>
            </div>
            <button
              className={styles.templateButton}
              type="button"
              onClick={downloadTemplate}
            >
              Download CSV template
            </button>
          </div>

          <label className={styles.filePicker}>
            <span className={styles.filePickerTitle}>
              {selectedFile || "Select a CSV file"}
            </span>
            <span className={styles.filePickerHelp}>
              {loading
                ? "Loading your records…"
                : databaseError
                  ? "Could not load your records. Reload to try again."
                  : "CSV only, up to 5 MiB"}
            </span>
            <input
              ref={fileInput}
              aria-label="CSV file"
              type="file"
              accept=".csv,text/csv"
              onChange={handleFileChange}
              disabled={
                !session || pending || loading || Boolean(databaseError)
              }
            />
          </label>

          {parsing && <p role="status">Checking the file…</p>}
          {databaseError && (
            <button
              className={styles.templateButton}
              type="button"
              onClick={refresh}
            >
              Try loading records again
            </button>
          )}
          {(selectedFile || preview.length > 0) && (
            <button
              className={styles.templateButton}
              type="button"
              disabled={pending}
              onClick={clearPreview}
            >
              Clear preview
            </button>
          )}
          <div className={styles.formatInfo}>
            <h3>Required columns</h3>
            <a href="/examples/synthetic-daily-totals.csv" download>
              Download an example CSV with fictional totals
            </a>
            <code>{requiredCsvHeaders.join(", ")}</code>
            <p>
              Dates use YYYY-MM-DD. Metric values must be non-negative whole
              numbers; readinessScore is optional. Leave it blank if unknown, or
              enter 0–100. Dates already in your data are rejected.
            </p>
          </div>

          <details>
            <summary>Import earlier browser data</summary>
            <p>
              Preview daily totals saved in this browser. Individual activities
              stay in the local copy.
            </p>
            <button
              type="button"
              disabled={
                !session || pending || loading || Boolean(databaseError)
              }
              onClick={previewBrowserTotals}
            >
              Preview browser totals
            </button>
          </details>

          {errors.length > 0 && (
            <div className={styles.errorBox} role="alert">
              <h3>Import needs attention</h3>
              <p>
                Every row must pass before the file can be added. Correct the
                listed rows and choose the file again. After a connection error,
                refresh saved records to check whether the import finished.
              </p>
              <button
                type="button"
                disabled={pending}
                onClick={() => {
                  clearPreview();
                  refresh();
                }}
              >
                Refresh saved records
              </button>
              <Link href="/home/journal">Correct an existing day</Link>
              <ul>
                {errors.map((error) => (
                  <li key={error}>{error}</li>
                ))}
              </ul>
            </div>
          )}

          {preview.length > 0 && session?.user.id !== previewOwner && (
            <p role="alert">
              Your account changed. Choose the file again to preview it for this
              account.
            </p>
          )}
          {preview.length > 0 && (
            <div className={styles.preview}>
              <div className={styles.previewHeading}>
                <div>
                  <h3>Ready to import</h3>
                  <p>
                    {preview.length} valid{" "}
                    {preview.length === 1 ? "record" : "records"} for{" "}
                    {previewEmail}. Every row will be saved together.
                  </p>
                </div>
                <button
                  className={styles.importButton}
                  type="button"
                  onClick={handleImport}
                  disabled={pending || session?.user.id !== previewOwner}
                >
                  {pending ? "Adding records…" : "Add records"}
                </button>
              </div>
              {preview.length > 50 && (
                <p>
                  Showing the first 50 of {preview.length} records. All{" "}
                  {preview.length} records will be added.
                </p>
              )}
              <div className={styles.tableWrap}>
                <table>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Steps</th>
                      <th>Move kcal</th>
                      <th>Rest min</th>
                      <th>Breathwork min</th>
                      <th>Readiness</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.slice(0, 50).map((metric) => (
                      <tr key={metric.date}>
                        <td>{metric.date}</td>
                        <td>{metric.steps?.toLocaleString("en-US")}</td>
                        <td>{metric.moveCalories}</td>
                        <td>{metric.restMinutes}</td>
                        <td>{metric.breatheMinutes}</td>
                        <td>{metric.readinessScore ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {successMessage && (
            <p className={styles.successMessage} role="status">
              {successMessage} <Link href="/home">View dashboard</Link>
            </p>
          )}
        </section>
      </div>
    </main>
  );
}
