import { Unzip, UnzipInflate, UnzipPassThrough } from "fflate";
import { AppleHealthCollector, type AppleHealthSummary } from "./collector";

export class AppleHealthFileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AppleHealthFileError";
  }
}

const YIELD_EVERY_BYTES = 8 * 1024 * 1024;
const nextTask = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

async function startsWithZipSignature(file: Blob) {
  const head = new Uint8Array(await file.slice(0, 4).arrayBuffer());
  return head[0] === 0x50 && head[1] === 0x4b && head[2] === 0x03 && head[3] === 0x04;
}

/**
 * Reads export.zip (as saved from the Health app) or an unzipped export.xml,
 * a chunk at a time, and returns daily totals. Nothing is uploaded.
 */
export async function readAppleHealthExport(
  file: Blob,
  onProgress?: (fraction: number) => void,
): Promise<AppleHealthSummary> {
  const collector = new AppleHealthCollector();
  const decoder = new TextDecoder();
  const isZip = await startsWithZipSignature(file);

  let foundXml = !isZip;
  let unzipError: Error | null = null;
  const unzip = isZip ? new Unzip() : null;
  if (unzip) {
    unzip.register(UnzipInflate);
    unzip.register(UnzipPassThrough);
    unzip.onfile = (entry) => {
      // The zip also holds export_cda.xml, workout routes and ECGs. Only export.xml is read.
      if (foundXml || !/(^|\/)export\.xml$/.test(entry.name)) return;
      foundXml = true;
      entry.ondata = (error, data, final) => {
        if (error) {
          unzipError = error;
          return;
        }
        collector.push(decoder.decode(data, { stream: !final }));
      };
      entry.start();
    };
  }

  const reader = file.stream().getReader();
  let bytesRead = 0;
  let sinceYield = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytesRead += value.byteLength;
      sinceYield += value.byteLength;
      if (unzip) {
        unzip.push(value, false);
        if (unzipError) throw new AppleHealthFileError("This zip file couldn't be read. Try exporting from the Health app again.");
      } else {
        collector.push(decoder.decode(value, { stream: true }));
      }
      if (sinceYield >= YIELD_EVERY_BYTES) {
        sinceYield = 0;
        onProgress?.(file.size ? bytesRead / file.size : 0);
        await nextTask();
      }
    }
    if (unzip) {
      unzip.push(new Uint8Array(0), true);
      if (unzipError) throw new AppleHealthFileError("This zip file couldn't be read. Try exporting from the Health app again.");
    } else {
      collector.push(decoder.decode());
    }
  } catch (error) {
    if (error instanceof AppleHealthFileError) throw error;
    throw new AppleHealthFileError("This file couldn't be read. Choose export.zip from the Health app, or the export.xml inside it.");
  } finally {
    reader.releaseLock();
  }
  onProgress?.(1);

  if (!foundXml) {
    throw new AppleHealthFileError("This zip doesn't contain export.xml. Choose the export.zip saved from the Health app.");
  }
  const summary = collector.finish();
  if (!summary.days.length && !summary.vitals.length) {
    throw new AppleHealthFileError("No steps, active energy, sleep, mindful minutes or heart readings were found in this export.");
  }
  return summary;
}

/** A file plus where it sat inside the folder the person picked or dropped. */
export type ExportFile = { file: File; path: string };

/**
 * Finds export.xml among the files of an unzipped Apple Health export. On a
 * Mac, opening export.zip gives an "apple_health_export" folder that holds
 * export.xml next to export_cda.xml, workout-routes and electrocardiograms.
 */
export function findExportXml(files: ExportFile[]): File | null {
  const candidates = files.filter(({ path }) => /(^|\/)export\.xml$/i.test(path));
  candidates.sort((a, b) => a.path.split("/").length - b.path.split("/").length);
  return candidates[0]?.file ?? null;
}

/** Picks the export.xml out of a folder chosen with a folder picker. */
export function exportFromFolderSelection(files: FileList | File[]): File {
  const list = Array.from(files).map((file) => ({ file, path: file.webkitRelativePath || file.name }));
  const xml = findExportXml(list);
  if (!xml) {
    throw new AppleHealthFileError(
      "That folder doesn't have export.xml in it. Choose the apple_health_export folder you got from the Health app.",
    );
  }
  return xml;
}

type Entry = {
  isFile: boolean;
  isDirectory: boolean;
  name: string;
  fullPath: string;
  file?: (resolve: (file: File) => void, reject: (error: unknown) => void) => void;
  createReader?: () => { readEntries: (resolve: (entries: Entry[]) => void, reject: (error: unknown) => void) => void };
};

async function readFolder(entry: Entry, depth: number): Promise<ExportFile[]> {
  if (entry.isFile && entry.file) {
    const file = await new Promise<File>((resolve, reject) => entry.file!(resolve, reject));
    return [{ file, path: entry.fullPath.replace(/^\//, "") }];
  }
  // export.xml sits at the top of the export folder, so there's no need to
  // walk deep into workout routes or ECG folders.
  if (!entry.isDirectory || !entry.createReader || depth > 2) return [];
  const reader = entry.createReader();
  const children: Entry[] = [];
  while (true) {
    const batch = await new Promise<Entry[]>((resolve, reject) => reader.readEntries(resolve, reject));
    if (!batch.length) break;
    children.push(...batch);
  }
  const wanted = children.filter((child) => child.isDirectory || /^export\.(xml|zip)$/i.test(child.name));
  return (await Promise.all(wanted.map((child) => readFolder(child, depth + 1)))).flat();
}

/**
 * Works out what was dropped onto the page: the export folder, export.zip,
 * or export.xml. Returns the file to read.
 */
export async function exportFromDrop(dataTransfer: DataTransfer): Promise<File> {
  const entries = Array.from(dataTransfer.items ?? [])
    .map((item) => (item.kind === "file" && "webkitGetAsEntry" in item ? (item.webkitGetAsEntry() as Entry | null) : null))
    .filter((entry): entry is Entry => entry !== null);

  if (entries.some((entry) => entry.isDirectory)) {
    const files = (await Promise.all(entries.map((entry) => readFolder(entry, 0)))).flat();
    const xml = findExportXml(files);
    if (xml) return xml;
    const zip = files.find(({ path }) => /(^|\/)export\.zip$/i.test(path));
    if (zip) return zip.file;
    throw new AppleHealthFileError(
      "That folder doesn't have export.xml in it. Drop the apple_health_export folder you got from the Health app.",
    );
  }

  const file = dataTransfer.files?.[0];
  if (!file) throw new AppleHealthFileError("Nothing was dropped. Try dragging the export folder again.");
  return file;
}
