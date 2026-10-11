/**
 * Multi-file ZIP archive creation utility using fflate.
 * Preserves relative folder structure and handles binary slices efficiently.
 */

import { zipSync, Zippable } from 'fflate';
import { sanitizeFileName } from './validation';

export interface ReceivedFileItem {
  name: string;
  path?: string;
  blob: Blob;
}

/**
 * Packs multiple Blobs into a single ZIP file Uint8Array and triggers browser download.
 */
export async function downloadFilesAsZip(
  files: ReceivedFileItem[],
  zipFilename = 'sharepin_files.zip'
): Promise<void> {
  const zippable: Zippable = {};

  for (const item of files) {
    const buffer = await item.blob.arrayBuffer();
    const uint8 = new Uint8Array(buffer);
    // Use relative path if available, otherwise filename
    const entryPath = item.path || item.name;
    zippable[entryPath] = uint8;
  }

  // Create ZIP synchronously with zero overhead
  const zipped = zipSync(zippable, { level: 6 });
  const zipBlob = new Blob([zipped as any], { type: 'application/zip' });

  // Trigger download
  const safeName = sanitizeFileName(zipFilename);
  const url = URL.createObjectURL(zipBlob);
  const a = document.createElement('a');
  a.href = url;
  a.download = safeName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
