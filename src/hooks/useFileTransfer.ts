import { useState, useCallback, useRef } from 'react';
import { FileTransferService } from '../services/fileTransfer';
import { TransferManifest, TransferProgress, FileMetadata, DEFAULT_CHUNK_SIZE } from '../types/transfer';
import { computeFileSHA256 } from '../utils/fileIntegrity';

export function useFileTransfer(dataChannel: RTCDataChannel | null) {
  const [progress, setProgress] = useState<TransferProgress | undefined>(undefined);
  const [manifest, setManifest] = useState<TransferManifest | null>(null);
  const transferServiceRef = useRef<FileTransferService | null>(null);

  const prepareManifest = useCallback(async (files: File[]): Promise<TransferManifest> => {
    const fileMetas: FileMetadata[] = [];
    let totalBytes = 0;

    for (let i = 0; i < files.length; i++) {
      const f = files[i]!;
      totalBytes += f.size;
      const chunkCount = Math.ceil(f.size / DEFAULT_CHUNK_SIZE) || 1;
      
      // Hash files <= 32MB upfront for integrity; for very large files, verify chunk streaming
      const sha256 = f.size <= 32 * 1024 * 1024 ? await computeFileSHA256(f) : undefined;

      fileMetas.push({
        id: crypto.randomUUID(),
        name: f.name,
        path: (f as any).webkitRelativePath || f.name,
        size: f.size,
        type: f.type || 'application/octet-stream',
        chunkCount,
        chunkSize: DEFAULT_CHUNK_SIZE,
        sha256,
        lastModified: f.lastModified,
      });
    }

    const newManifest: TransferManifest = {
      manifestId: crypto.randomUUID(),
      files: fileMetas,
      totalBytes,
      totalFiles: files.length,
    };

    setManifest(newManifest);
    return newManifest;
  }, []);

  const startSending = useCallback(async (files: File[]) => {
    if (!dataChannel) throw new Error('DataChannel is not open');

    const service = new FileTransferService(dataChannel);
    transferServiceRef.current = service;

    await service.sendFiles(files, (p) => {
      setProgress({ ...p });
    });
  }, [dataChannel]);

  const startReceiving = useCallback(async (incomingManifest: TransferManifest) => {
    if (!dataChannel) throw new Error('DataChannel is not open');

    const service = new FileTransferService(dataChannel);
    transferServiceRef.current = service;

    await service.receiveFiles(
      incomingManifest,
      (p) => {
        setProgress({ ...p });
      },
      (_fileIndex, metadata, blob) => {
        // Automatically save each received file to user's device
        FileTransferService.triggerDownload(blob, metadata.name);
      }
    );
  }, [dataChannel]);

  const cancel = useCallback(() => {
    transferServiceRef.current?.cancel();
    setProgress((prev) => prev ? { ...prev, status: 'CANCELLED' } : undefined);
  }, []);

  return {
    progress,
    setProgress,
    manifest,
    setManifest,
    prepareManifest,
    startSending,
    startReceiving,
    cancel,
  };
}
