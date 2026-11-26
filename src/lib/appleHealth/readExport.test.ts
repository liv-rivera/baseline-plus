// @vitest-environment node
import { readFileSync } from "node:fs";
import path from "node:path";
import { strToU8, zipSync } from "fflate";
import { describe, expect, it, vi } from "vitest";
import { collectAppleHealthXml } from "./collector";
import { AppleHealthFileError, readAppleHealthExport } from "./readExport";

const xml = readFileSync(path.join(__dirname, "..", "..", "test", "fixtures", "apple-health", "export.xml"), "utf8");
const expected = collectAppleHealthXml(xml).days;
const zipBlob = (bytes: Uint8Array) => new Blob([bytes as Uint8Array<ArrayBuffer>]);

describe("readAppleHealthExport", () => {
  it("reads export.zip the way the Health app saves it, skipping the other files", async () => {
    const zip = zipSync({
      "apple_health_export/export.xml": strToU8(xml),
      "apple_health_export/export_cda.xml": strToU8("<ClinicalDocument/>"),
      "apple_health_export/workout-routes/route_2026-11-02.gpx": strToU8("<gpx/>"),
    });
    const progress = vi.fn();
    const summary = await readAppleHealthExport(zipBlob(zip), progress);
    expect(summary.days).toEqual(expected);
    expect(progress).toHaveBeenLastCalledWith(1);
  });

  it("reads an unzipped export.xml", async () => {
    const summary = await readAppleHealthExport(new Blob([xml]));
    expect(summary.days).toEqual(expected);
  });

  it("reads a zip whose entries are stored without compression", async () => {
    const zip = zipSync({ "apple_health_export/export.xml": [strToU8(xml), { level: 0 }] });
    expect((await readAppleHealthExport(zipBlob(zip))).days).toEqual(expected);
  });

  it("explains when the zip has no export.xml", async () => {
    const zip = zipSync({ "photos/cat.jpg": strToU8("not a health export") });
    await expect(readAppleHealthExport(zipBlob(zip))).rejects.toThrow(/doesn't contain export\.xml/);
  });

  it("explains when the export has none of the four totals", async () => {
    await expect(readAppleHealthExport(new Blob(["<HealthData></HealthData>"]))).rejects.toThrow(AppleHealthFileError);
  });

  it("reports a damaged zip", async () => {
    const zip = zipSync({ "apple_health_export/export.xml": strToU8(xml) });
    const damaged = zip.slice();
    damaged.fill(7, 60, 400);
    await expect(readAppleHealthExport(zipBlob(damaged))).rejects.toThrow(AppleHealthFileError);
  });
});
