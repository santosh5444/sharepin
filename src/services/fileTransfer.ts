/**
 * File Transfer Engine
 * Handles streaming chunked transfers, DataChannel backpressure,
 * SHA-256 verification, and local file saving.
 */

import {
  FileMetadata,
  TransferManifest,
  TransferProgress,
  DEFAULT_CHUNK_SIZE,
  BUFFERED_AMOUNT_LOW_THRESHOLD,
  BUFFERED_AMOUNT_HIGH_WATERMARK,
  PacketType,
} from '../types/transfer';
import { packChunk, unpackPacket } from '../utils/packetProtocol';
import { computeSHA256 } from '../utils/fileIntegrity';
import { createFileSink, FileSink } from '../utils/fileSink';
import { compressChunk, decompressChunk, isCompressibleFile } from '../utils/streamCompression';
import { sanitizeFileName } from '../utils/validation';

export type ProgressCallback = (progress: TransferProgress) => void;

export type TransferTransport = RTCDataChannel | WebSocket;

export class FileTransferService {
  private transport: TransferTransport;
  private isCancelled = false;

  constructor(transport: TransferTransport) {
    this.transport = transport;
    if ('bufferedAmountLowThreshold' in this.transport) {
      (this.transport as RTCDataChannel).bufferedAmountLowThreshold = BUFFERED_AMOUNT_LOW_THRESHOLD;
    }
  }

  /**
   * Waits for data channel bufferedAmount to drain below threshold
   */
  private async waitForBufferDrain(): Promise<void> {
    if ((this.transport.bufferedAmount || 0) <= BUFFERED_AMOUNT_LOW_THRESHOLD) {
      return;
    }

    return new Promise((resolve) => {
      let timer: any = null;

      const handleLow = () => {
        cleanup();
        resolve();
      };

      const cleanup = () => {
        if (timer) clearInterval(timer);
        try {
          this.transport.removeEventListener('bufferedamountlow', handleLow);
        } catch {}
      };

      try {
        this.transport.addEventListener('bufferedamountlow', handleLow);
      } catch {}

      // Fast 4ms polling watchdog guarantees zero stalling or missed event deadlocks
      timer = setInterval(() => {
        if ((this.transport.bufferedAmount || 0) <= BUFFERED_AMOUNT_LOW_THRESHOLD) {
          cleanup();
          resolve();
        }
      }, 4);
    });
  }

  /**
   * SENDER: Probes transport with HANDSHAKE_PROBE packets until recipient responds with HANDSHAKE_ACK.
   * Confirms bidirectional connectivity and that recipient message listener is active.
   */
  private async performHandshake(timeoutMs: number = 15000): Promise<void> {
    const probe = packChunk(PacketType.HANDSHAKE_PROBE, 0, 0, new Uint8Array(0));

    return new Promise((resolve, reject) => {
      let isDone = false;
      let intervalId: any = null;
      let timeoutId: any = null;

      const handleAck = async (event: Event) => {
        const msgEvent = event as MessageEvent;
        let rawData = msgEvent.data;
        if (typeof rawData === 'string') return;
        if (typeof Blob !== 'undefined' && rawData instanceof Blob) {
          rawData = await rawData.arrayBuffer();
        }
        const unpacked = unpackPacket(rawData);
        if (unpacked && unpacked.type === PacketType.HANDSHAKE_ACK) {
          isDone = true;
          cleanup();
          resolve();
        }
      };

      const cleanup = () => {
        if (intervalId) clearInterval(intervalId);
        if (timeoutId) clearTimeout(timeoutId);
        this.transport.removeEventListener('message', handleAck);
      };

      this.transport.addEventListener('message', handleAck);

      // Probe immediately
      try {
        this.transport.send(probe.buffer as ArrayBuffer);
      } catch {}

      // Retry probe every 100ms for ultra-fast connection start
      intervalId = setInterval(() => {
        if (isDone || this.isCancelled) return;
        try {
          this.transport.send(probe.buffer as ArrayBuffer);
        } catch {}
      }, 100);

      timeoutId = setTimeout(() => {
        cleanup();
        reject(new Error('Recipient transport handshake timeout'));
      }, timeoutMs);
    });
  }

  /**
   * SENDER: Waits for recipient to confirm all files have been received and verified.
   */
  private async waitForCompletionAck(timeoutMs: number = 10000): Promise<void> {
    return new Promise((resolve) => {
      let timeoutId: any = null;

      const handleComplete = async (event: Event) => {
        const msgEvent = event as MessageEvent;
        let rawData = msgEvent.data;
        if (typeof rawData === 'string') return;
        if (typeof Blob !== 'undefined' && rawData instanceof Blob) {
          rawData = await rawData.arrayBuffer();
        }
        const unpacked = unpackPacket(rawData);
        if (unpacked && unpacked.type === PacketType.TRANSFER_COMPLETE) {
          if (timeoutId) clearTimeout(timeoutId);
          this.transport.removeEventListener('message', handleComplete);
          resolve();
        }
      };

      this.transport.addEventListener('message', handleComplete);

      timeoutId = setTimeout(() => {
        this.transport.removeEventListener('message', handleComplete);
        resolve(); // Graceful resolve after timeout
      }, timeoutMs);
    });
  }

  /**
   * SENDER: Streams files sequentially using slice() and backpressure
   */
  public async sendFiles(
    files: File[],
    onProgress: ProgressCallback
  ): Promise<void> {
    this.isCancelled = false;
    const totalBytes = files.reduce((sum, f) => sum + f.size, 0);
    let totalBytesTransferred = 0;
    const startTime = Date.now();
    let lastMetricsTime = startTime;
    let lastBytesSample = 0;
    let currentSpeedBps = 0;

    onProgress({
      currentFileIndex: 0,
      currentFileName: files[0]?.name || 'Files',
      currentFileBytesTransferred: 0,
      currentFileSize: files[0]?.size || 0,
      totalFiles: files.length,
      totalBytesTransferred: 0,
      totalBytes,
      speedBps: 0,
      etaSeconds: null,
      status: 'TRANSFERRING',
    });

    // Verify recipient transport is active before streaming chunks
    await this.performHandshake(15000);

    for (let fileIndex = 0; fileIndex < files.length; fileIndex++) {
      if (this.isCancelled) throw new Error('Transfer cancelled by user');

      const file = files[fileIndex]!;
      const totalChunks = Math.ceil(file.size / DEFAULT_CHUNK_SIZE) || 1;
      let fileBytesTransferred = 0;
      let shouldTryCompress = isCompressibleFile(file.name, file.type);
      let testedChunks = 0;

      // Pipeline: pre-read first chunk
      let nextChunkPromise: Promise<ArrayBuffer> | null =
        totalChunks > 0 ? file.slice(0, Math.min(DEFAULT_CHUNK_SIZE, file.size)).arrayBuffer() : null;

      for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
        if (this.isCancelled) throw new Error('Transfer cancelled by user');

        const chunkBuffer = await nextChunkPromise!;

        // Pipeline / prefetch next chunk concurrently while sending this chunk
        if (chunkIndex + 1 < totalChunks) {
          const nextStart = (chunkIndex + 1) * DEFAULT_CHUNK_SIZE;
          const nextEnd = Math.min(nextStart + DEFAULT_CHUNK_SIZE, file.size);
          nextChunkPromise = file.slice(nextStart, nextEnd).arrayBuffer();
        }

        const payload = new Uint8Array(chunkBuffer);
        let finalPayload: Uint8Array<ArrayBufferLike> = payload;
        let flags = 0x00;

        if (shouldTryCompress) {
          const compressed = await compressChunk(payload);
          if (compressed) {
            finalPayload = compressed;
            flags = 0x01;
          } else {
            testedChunks++;
            // If the first 2 chunks fail to yield compression, skip CPU work for remaining chunks
            if (testedChunks >= 2) {
              shouldTryCompress = false;
            }
          }
        }

        const packet = packChunk(
          PacketType.FILE_CHUNK,
          fileIndex,
          chunkIndex,
          finalPayload,
          flags
        );

        // Check backpressure before queueing
        if ((this.transport.bufferedAmount || 0) >= BUFFERED_AMOUNT_HIGH_WATERMARK) {
          await this.waitForBufferDrain();
        }

        this.transport.send(packet.buffer as ArrayBuffer);

        fileBytesTransferred += payload.byteLength;
        totalBytesTransferred += payload.byteLength;

        // Calculate speed & ETA every 250ms
        const now = Date.now();
        const elapsedSinceMetrics = (now - lastMetricsTime) / 1000;
        if (elapsedSinceMetrics >= 0.25 || chunkIndex === totalChunks - 1) {
          // Account for bytes currently buffered in the outgoing network socket
          const buffered = this.transport.bufferedAmount || 0;
          const actualTransferred = Math.min(
            totalBytes,
            Math.max(0, totalBytesTransferred - buffered)
          );
          const actualFileTransferred = Math.min(
            file.size,
            Math.max(0, fileBytesTransferred - buffered)
          );

          const bytesDiff = actualTransferred - lastBytesSample;
          const instantaneousSpeed = Math.max(0, bytesDiff / (elapsedSinceMetrics || 0.001));
          currentSpeedBps = currentSpeedBps === 0
            ? instantaneousSpeed
            : currentSpeedBps * 0.7 + instantaneousSpeed * 0.3; // EMA smoothing

          lastMetricsTime = now;
          lastBytesSample = actualTransferred;

          const remainingBytes = Math.max(0, totalBytes - actualTransferred);
          const eta = currentSpeedBps > 0 ? remainingBytes / currentSpeedBps : null;

          onProgress({
            currentFileIndex: fileIndex,
            currentFileName: file.name,
            currentFileBytesTransferred: actualFileTransferred,
            currentFileSize: file.size,
            totalFiles: files.length,
            totalBytesTransferred: actualTransferred,
            totalBytes,
            speedBps: currentSpeedBps,
            etaSeconds: eta,
            status: 'TRANSFERRING',
          });
        }
      }

      // Flush remaining buffered bytes to physical wire before signaling file end
      await this.waitForBufferDrain();

      // Signal completion of current file
      const endPacket = packChunk(PacketType.END_FILE, fileIndex, totalChunks, new Uint8Array(0));
      this.transport.send(endPacket.buffer as ArrayBuffer);
    }

    onProgress({
      currentFileIndex: files.length - 1,
      currentFileName: files[files.length - 1]?.name || '',
      currentFileBytesTransferred: files[files.length - 1]?.size || 0,
      currentFileSize: files[files.length - 1]?.size || 0,
      totalFiles: files.length,
      totalBytesTransferred: totalBytes,
      totalBytes,
      speedBps: currentSpeedBps,
      etaSeconds: 0,
      status: 'VERIFYING_INTEGRITY',
    });

    // Wait for recipient to acknowledge full receipt & verification
    await this.waitForCompletionAck(10000);

    onProgress({
      currentFileIndex: files.length - 1,
      currentFileName: files[files.length - 1]?.name || '',
      currentFileBytesTransferred: files[files.length - 1]?.size || 0,
      currentFileSize: files[files.length - 1]?.size || 0,
      totalFiles: files.length,
      totalBytesTransferred: totalBytes,
      totalBytes,
      speedBps: 0,
      etaSeconds: 0,
      status: 'COMPLETED',
    });
  }

  /**
   * RECEIVER: Listens on DataChannel and streams incoming chunks
   */
  public async receiveFiles(
    manifest: TransferManifest,
    onProgress: ProgressCallback,
    onFileComplete?: (fileIndex: number, metadata: FileMetadata, blob: Blob) => void
  ): Promise<void> {
    this.isCancelled = false;
    let totalBytesReceived = 0;
    const fileSinksMap = new Map<number, FileSink>();
    const fileBytesReceivedMap = new Map<number, number>();

    onProgress({
      currentFileIndex: 0,
      currentFileName: manifest.files[0]?.name || 'Files',
      currentFileBytesTransferred: 0,
      currentFileSize: manifest.files[0]?.size || 0,
      totalFiles: manifest.totalFiles,
      totalBytesTransferred: 0,
      totalBytes: manifest.totalBytes,
      speedBps: 0,
      etaSeconds: null,
      status: 'TRANSFERRING',
    });

    let lastMetricsTime = Date.now();
    let lastBytesSample = 0;
    let currentSpeedBps = 0;

    return new Promise((resolve, reject) => {
      const handleMessage = async (event: Event) => {
        const msgEvent = event as MessageEvent;
        if (this.isCancelled) {
          this.transport.removeEventListener('message', handleMessage);
          reject(new Error('Transfer cancelled by user'));
          return;
        }

        let rawData = msgEvent.data;
        if (typeof rawData === 'string') {
          return; // Ignore signaling frames if transport is WebSocket
        }
        if (typeof Blob !== 'undefined' && rawData instanceof Blob) {
          rawData = await rawData.arrayBuffer();
        }

        const unpacked = unpackPacket(rawData);
        if (!unpacked) return;

        if (unpacked.type === PacketType.HANDSHAKE_PROBE) {
          // Immediately acknowledge probe to unblock sender streaming
          const ack = packChunk(PacketType.HANDSHAKE_ACK, 0, 0, new Uint8Array(0));
          try {
            this.transport.send(ack.buffer as ArrayBuffer);
          } catch {}
          return;
        }

        if (unpacked.type === PacketType.CANCEL) {
          this.transport.removeEventListener('message', handleMessage);
          reject(new Error('Transfer cancelled by sender'));
          return;
        }

        const fileMeta = manifest.files[unpacked.fileIndex];
        if (!fileMeta) return;

        if (unpacked.type === PacketType.FILE_CHUNK) {
          let sink = fileSinksMap.get(unpacked.fileIndex);
          if (!sink) {
            sink = await createFileSink(fileMeta.name, fileMeta.type, fileMeta.size);
            fileSinksMap.set(unpacked.fileIndex, sink);
          }

          const chunkData = (unpacked.flags & 0x01)
            ? await decompressChunk(unpacked.payload)
            : unpacked.payload;

          await sink.write(chunkData);

          const curBytes = (fileBytesReceivedMap.get(unpacked.fileIndex) || 0) + chunkData.byteLength;
          fileBytesReceivedMap.set(unpacked.fileIndex, curBytes);
          totalBytesReceived += chunkData.byteLength;

          // Metrics update
          const now = Date.now();
          const elapsed = (now - lastMetricsTime) / 1000;
          if (elapsed >= 0.25) {
            const bytesDiff = totalBytesReceived - lastBytesSample;
            const instSpeed = bytesDiff / (elapsed || 0.001);
            currentSpeedBps = currentSpeedBps === 0 ? instSpeed : currentSpeedBps * 0.7 + instSpeed * 0.3;
            lastMetricsTime = now;
            lastBytesSample = totalBytesReceived;

            const remaining = Math.max(0, manifest.totalBytes - totalBytesReceived);
            const eta = currentSpeedBps > 0 ? remaining / currentSpeedBps : null;

            onProgress({
              currentFileIndex: unpacked.fileIndex,
              currentFileName: fileMeta.name,
              currentFileBytesTransferred: curBytes,
              currentFileSize: fileMeta.size,
              totalFiles: manifest.totalFiles,
              totalBytesTransferred: totalBytesReceived,
              totalBytes: manifest.totalBytes,
              speedBps: currentSpeedBps,
              etaSeconds: eta,
              status: 'TRANSFERRING',
            });
          }
        } else if (unpacked.type === PacketType.END_FILE) {
          // File completed, finalize blob from disk or RAM
          const sink = fileSinksMap.get(unpacked.fileIndex);
          const combinedBlob = sink
            ? await sink.close()
            : new Blob([], { type: fileMeta.type || 'application/octet-stream' });
          fileSinksMap.delete(unpacked.fileIndex); // Free memory immediately

          onProgress({
            currentFileIndex: unpacked.fileIndex,
            currentFileName: fileMeta.name,
            currentFileBytesTransferred: fileMeta.size,
            currentFileSize: fileMeta.size,
            totalFiles: manifest.totalFiles,
            totalBytesTransferred: totalBytesReceived,
            totalBytes: manifest.totalBytes,
            speedBps: currentSpeedBps,
            etaSeconds: null,
            status: 'VERIFYING_INTEGRITY',
          });

          if (fileMeta.sha256) {
            const buffer = await combinedBlob.arrayBuffer();
            const computed = await computeSHA256(buffer);
            if (computed.toLowerCase() !== fileMeta.sha256.toLowerCase()) {
              this.transport.removeEventListener('message', handleMessage);
              reject(new Error(`Integrity check failed for ${fileMeta.name}`));
              return;
            }
          }

          if (onFileComplete) {
            onFileComplete(unpacked.fileIndex, fileMeta, combinedBlob);
          }

          // Check if all files in manifest are done
          if (unpacked.fileIndex === manifest.totalFiles - 1) {
            // Signal sender that recipient completed download & integrity verification
            const completePacket = packChunk(PacketType.TRANSFER_COMPLETE, unpacked.fileIndex, 0, new Uint8Array(0));
            try {
              this.transport.send(completePacket.buffer as ArrayBuffer);
            } catch {}

            this.transport.removeEventListener('message', handleMessage);
            onProgress({
              currentFileIndex: unpacked.fileIndex,
              currentFileName: fileMeta.name,
              currentFileBytesTransferred: fileMeta.size,
              currentFileSize: fileMeta.size,
              totalFiles: manifest.totalFiles,
              totalBytesTransferred: manifest.totalBytes,
              totalBytes: manifest.totalBytes,
              speedBps: 0,
              etaSeconds: 0,
              status: 'COMPLETED',
            });
            resolve();
          }
        }
      };

      this.transport.addEventListener('message', handleMessage);
      this.transport.addEventListener('close', () => {
        if (totalBytesReceived < manifest.totalBytes) {
          reject(new Error('Channel closed before file transfer finished'));
        }
      });
    });
  }

  /**
   * Triggers download of received Blob to user's device
   */
  public static triggerDownload(blob: Blob, originalName: string): void {
    const safeName = sanitizeFileName(originalName);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = safeName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }

  public cancel(): void {
    this.isCancelled = true;
    try {
      const cancelPacket = packChunk(PacketType.CANCEL, 0, 0, new Uint8Array(0));
      if ((this.transport as any).readyState === 'open' || this.transport.readyState === WebSocket.OPEN || (this.transport as any).readyState === 1) {
        this.transport.send(cancelPacket.buffer as ArrayBuffer);
      }
    } catch {}
  }
}
