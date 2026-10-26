/**
 * File Sink Utility (OPFS & In-Memory Streaming)
 * 
 * Automatically writes large files (>= 30MB) directly to device physical storage
 * using Origin Private File System (OPFS), keeping browser RAM usage near 0 MB.
 * For smaller files, streams directly through RAM for maximum micro-latency.
 */

export interface FileSink {
  write(chunk: Uint8Array): Promise<void> | void;
  close(): Promise<Blob>;
}

export async function createFileSink(
  _filename: string,
  mimeType: string,
  fileSize: number
): Promise<FileSink> {
  // If browser supports OPFS and file is large (>= 30 MB), stream straight to disk
  if (
    typeof navigator !== 'undefined' &&
    navigator.storage &&
    typeof navigator.storage.getDirectory === 'function' &&
    fileSize >= 30 * 1024 * 1024
  ) {
    try {
      const root = await navigator.storage.getDirectory();
      const tempId = `sharepin_${Date.now()}_${Math.random().toString(36).slice(2)}.tmp`;
      const handle = await root.getFileHandle(tempId, { create: true });
      const writable = await handle.createWritable();

      // Batch buffered writes: buffer up to 4 MiB in memory before writing to OPFS
      // Reduces 6,000+ disk I/O calls down to ~200, eliminating flash storage IPC bottlenecks
      const WRITE_BATCH_SIZE = 4 * 1024 * 1024; // 4 MiB
      let writeBuffer: Uint8Array[] = [];
      let bufferedBytes = 0;

      const flushBuffer = async () => {
        if (bufferedBytes === 0) return;
        const combined = new Uint8Array(bufferedBytes);
        let offset = 0;
        for (const part of writeBuffer) {
          combined.set(part, offset);
          offset += part.byteLength;
        }
        writeBuffer = [];
        bufferedBytes = 0;
        await writable.write(combined as any);
      };

      return {
        async write(chunk: Uint8Array) {
          writeBuffer.push(chunk);
          bufferedBytes += chunk.byteLength;
          if (bufferedBytes >= WRITE_BATCH_SIZE) {
            await flushBuffer();
          }
        },
        async close(): Promise<Blob> {
          await flushBuffer();
          await writable.close();
          const file = await handle.getFile();
          // Clean up OPFS temporary record after download starts
          setTimeout(async () => {
            try {
              await root.removeEntry(tempId);
            } catch {}
          }, 120000);
          return file;
        },
      };
    } catch {
      // Graceful fallback to memory buffer if OPFS is unavailable or restricted
    }
  }

  // Fast in-memory buffer sink for smaller files
  const chunks: Uint8Array[] = [];
  return {
    write(chunk: Uint8Array) {
      chunks.push(chunk);
    },
    async close(): Promise<Blob> {
      const blob = new Blob(chunks as unknown as BlobPart[], {
        type: mimeType || 'application/octet-stream',
      });
      chunks.length = 0; // Immediate garbage collection release
      return blob;
    },
  };
}
