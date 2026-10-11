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
import { sanitizeFileName } from '../utils/validation';

export type ProgressCallback = (progress: TransferProgress) => void;

export class FileTransferService {
  private dataChannel: RTCDataChannel;
  private isCancelled = false;

  constructor(dataChannel: RTCDataChannel) {
    this.dataChannel = dataChannel;
    // Set threshold for backpressure event
    this.dataChannel.bufferedAmountLowThreshold = BUFFERED_AMOUNT_LOW_THRESHOLD;
  }

  /**
   * Waits for data channel bufferedAmount to drain below threshold
   */
  private async waitForBufferDrain(): Promise<void> {
    if (this.dataChannel.bufferedAmount <= BUFFERED_AMOUNT_LOW_THRESHOLD) {
      return;
    }

    return new Promise((resolve, reject) => {
      const handleLow = () => {
        this.dataChannel.removeEventListener('bufferedamountlow', handleLow);
        this.dataChannel.removeEventListener('close', handleClose);
        resolve();
      };

      const handleClose = () => {
        this.dataChannel.removeEventListener('bufferedamountlow', handleLow);
        this.dataChannel.removeEventListener('close', handleClose);
        reject(new Error('DataChannel closed while waiting for buffer drain'));
      };

      this.dataChannel.addEventListener('bufferedamountlow', handleLow);
      this.dataChannel.addEventListener('close', handleClose);
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

    for (let fileIndex = 0; fileIndex < files.length; fileIndex++) {
      if (this.isCancelled) throw new Error('Transfer cancelled by user');

      const file = files[fileIndex]!;
      const totalChunks = Math.ceil(file.size / DEFAULT_CHUNK_SIZE) || 1;
      let fileBytesTransferred = 0;

      for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
        if (this.isCancelled) throw new Error('Transfer cancelled by user');

        const start = chunkIndex * DEFAULT_CHUNK_SIZE;
        const end = Math.min(start + DEFAULT_CHUNK_SIZE, file.size);
        const slice = file.slice(start, end);
        const chunkBuffer = await slice.arrayBuffer();
        const payload = new Uint8Array(chunkBuffer);

        const packet = packChunk(
          PacketType.FILE_CHUNK,
          fileIndex,
          chunkIndex,
          payload
        );

        // Check backpressure before queueing
        if (this.dataChannel.bufferedAmount >= BUFFERED_AMOUNT_HIGH_WATERMARK) {
          await this.waitForBufferDrain();
        }

        this.dataChannel.send(packet.buffer as ArrayBuffer);

        fileBytesTransferred += payload.byteLength;
        totalBytesTransferred += payload.byteLength;

        // Calculate speed & ETA every 250ms
        const now = Date.now();
        const elapsedSinceMetrics = (now - lastMetricsTime) / 1000;
        if (elapsedSinceMetrics >= 0.25 || chunkIndex === totalChunks - 1) {
          const bytesDiff = totalBytesTransferred - lastBytesSample;
          const instantaneousSpeed = bytesDiff / (elapsedSinceMetrics || 0.001);
          currentSpeedBps = currentSpeedBps === 0
            ? instantaneousSpeed
            : currentSpeedBps * 0.7 + instantaneousSpeed * 0.3; // EMA smoothing

          lastMetricsTime = now;
          lastBytesSample = totalBytesTransferred;

          const remainingBytes = Math.max(0, totalBytes - totalBytesTransferred);
          const eta = currentSpeedBps > 0 ? remainingBytes / currentSpeedBps : null;

          onProgress({
            currentFileIndex: fileIndex,
            currentFileName: file.name,
            currentFileBytesTransferred: fileBytesTransferred,
            currentFileSize: file.size,
            totalFiles: files.length,
            totalBytesTransferred,
            totalBytes,
            speedBps: currentSpeedBps,
            etaSeconds: eta,
            status: 'TRANSFERRING',
          });
        }
      }

      // Signal completion of current file
      const endPacket = packChunk(PacketType.END_FILE, fileIndex, totalChunks, new Uint8Array(0));
      this.dataChannel.send(endPacket.buffer as ArrayBuffer);
    }

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
    const fileChunksMap = new Map<number, Uint8Array[]>();
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
      const handleMessage = async (event: MessageEvent) => {
        if (this.isCancelled) {
          this.dataChannel.removeEventListener('message', handleMessage);
          reject(new Error('Transfer cancelled by user'));
          return;
        }

        const unpacked = unpackPacket(event.data);
        if (!unpacked) return;

        if (unpacked.type === PacketType.CANCEL) {
          this.dataChannel.removeEventListener('message', handleMessage);
          reject(new Error('Transfer cancelled by sender'));
          return;
        }

        const fileMeta = manifest.files[unpacked.fileIndex];
        if (!fileMeta) return;

        if (unpacked.type === PacketType.FILE_CHUNK) {
          let chunks = fileChunksMap.get(unpacked.fileIndex);
          if (!chunks) {
            chunks = [];
            fileChunksMap.set(unpacked.fileIndex, chunks);
          }
          chunks.push(unpacked.payload);

          const curBytes = (fileBytesReceivedMap.get(unpacked.fileIndex) || 0) + unpacked.payloadLength;
          fileBytesReceivedMap.set(unpacked.fileIndex, curBytes);
          totalBytesReceived += unpacked.payloadLength;

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
          // File completed, reconstruct blob & verify integrity
          const chunks = fileChunksMap.get(unpacked.fileIndex) || [];
          const combinedBlob = new Blob(chunks as unknown as BlobPart[], { type: fileMeta.type || 'application/octet-stream' });
          fileChunksMap.delete(unpacked.fileIndex); // Free memory

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
              this.dataChannel.removeEventListener('message', handleMessage);
              reject(new Error(`Integrity check failed for ${fileMeta.name}`));
              return;
            }
          }

          if (onFileComplete) {
            onFileComplete(unpacked.fileIndex, fileMeta, combinedBlob);
          }

          // Check if all files in manifest are done
          if (unpacked.fileIndex === manifest.totalFiles - 1) {
            this.dataChannel.removeEventListener('message', handleMessage);
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

      this.dataChannel.addEventListener('message', handleMessage);
      this.dataChannel.addEventListener('close', () => {
        if (totalBytesReceived < manifest.totalBytes) {
          reject(new Error('DataChannel closed before file transfer finished'));
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
      if (this.dataChannel.readyState === 'open') {
        this.dataChannel.send(cancelPacket.buffer as ArrayBuffer);
      }
    } catch {}
  }
}
