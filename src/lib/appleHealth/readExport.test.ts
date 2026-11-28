// @vitest-environment node
import { readFileSync } from "node:fs";
import path from "node:path";
import { strToU8, zipSync } from "fflate";
import { describe, expect, it, vi } from "vitest";
import { collectAppleHealthXml } from "./collector";
import { AppleHealthFileError, exportFromDrop, exportFromFolderSelection, findExportXml, readAppleHealthExport } from "./readExport";

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

const named = (path: string) => ({ file: new File([path], path.split("/").pop()!), path });

describe("finding export.xml in a folder", () => {
  it("takes export.xml, not export_cda.xml or anything deeper", () => {
    const files = [
      named("apple_health_export/export_cda.xml"),
      named("apple_health_export/workout-routes/export.xml"),
      named("apple_health_export/export.xml"),
    ];
    expect(findExportXml(files)).toBe(files[2].file);
    expect(findExportXml([named("apple_health_export/export_cda.xml")])).toBeNull();
  });

  it("explains a folder picker choice without export.xml", () => {
    expect(() => exportFromFolderSelection([new File(["x"], "notes.txt")])).toThrow(AppleHealthFileError);
  });
});

describe("exportFromDrop", () => {
  type FakeEntry = { isFile: boolean; isDirectory: boolean; name: string; fullPath: string; file?: unknown; createReader?: unknown };
  const fileEntry = (fullPath: string): FakeEntry => {
    const file = new File([fullPath], fullPath.split("/").pop()!);
    return { isFile: true, isDirectory: false, name: file.name, fullPath, file: (resolve: (f: File) => void) => resolve(file) };
  };
  const folderEntry = (fullPath: string, children: FakeEntry[]): FakeEntry => ({
    isFile: false,
    isDirectory: true,
    name: fullPath.split("/").pop()!,
    fullPath,
    createReader: () => {
      let done = false;
      return { readEntries: (resolve: (entries: FakeEntry[]) => void) => { resolve(done ? [] : children); done = true; } };
    },
  });
  const drop = (entries: FakeEntry[], files: File[] = []) =>
    ({ items: entries.map((entry) => ({ kind: "file", webkitGetAsEntry: () => entry })), files }) as unknown as DataTransfer;

  it("finds export.xml in a dropped apple_health_export folder", async () => {
    const folder = folderEntry("/apple_health_export", [
      fileEntry("/apple_health_export/export_cda.xml"),
      folderEntry("/apple_health_export/electrocardiograms", [fileEntry("/apple_health_export/electrocardiograms/ecg.csv")]),
      fileEntry("/apple_health_export/export.xml"),
    ]);
    const file = await exportFromDrop(drop([folder]));
    expect(file.name).toBe("export.xml");
    expect(await file.text()).toBe("/apple_health_export/export.xml");
  });

  it("uses a dropped zip or xml file as it is", async () => {
    const zip = new File(["zip"], "export.zip");
    expect(await exportFromDrop(drop([fileEntry("/export.zip")], [zip]))).toBe(zip);
  });

  it("explains a dropped folder without the export", async () => {
    await expect(exportFromDrop(drop([folderEntry("/Photos", [fileEntry("/Photos/cat.jpg")])]))).rejects.toThrow(AppleHealthFileError);
  });
});
