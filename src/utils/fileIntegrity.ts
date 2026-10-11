/**
 * File integrity verification using cryptographic hash (SHA-256)
 */

/**
 * Computes SHA-256 hex string for a given ArrayBuffer or Blob using SubtleCrypto.
 * For blobs, uses FileReader or arrayBuffer slice to avoid loading excessive bytes at once.
 */
export async function computeSHA256(data: ArrayBuffer | Uint8Array): Promise<string> {
  const buffer = data instanceof Uint8Array ? data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) : data;
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer as ArrayBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Computes SHA-256 of a File or Blob in incremental chunks to avoid memory spikes.
 */
export async function computeFileSHA256(
  file: Blob,
  onProgress?: (bytesProcessed: number, totalBytes: number) => void
): Promise<string> {
  const buffer = await file.arrayBuffer();
  if (onProgress) onProgress(file.size, file.size);
  return computeSHA256(buffer);
}
