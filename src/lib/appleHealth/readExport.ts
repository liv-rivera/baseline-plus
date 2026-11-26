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
  if (!summary.days.length) {
    throw new AppleHealthFileError("No steps, active energy, sleep or mindful minutes were found in this export.");
  }
  return summary;
}
