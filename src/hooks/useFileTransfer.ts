import { useState, useCallback, useRef } from 'react';
import { FileTransferService, TransferTransport } from '../services/fileTransfer';
import { TransferManifest, TransferProgress, FileMetadata, DEFAULT_CHUNK_SIZE } from '../types/transfer';

export interface CompletedFileItem {
  name: string;
  path?: string;
  size: number;
  type: string;
  blob: Blob;
  sha256?: string;
}

export function useFileTransfer(transport: TransferTransport | null) {
  const [progress, setProgress] = useState<TransferProgress | undefined>(undefined);
  const [manifest, setManifest] = useState<TransferManifest | null>(null);
  const [receivedFiles, setReceivedFiles] = useState<CompletedFileItem[]>([]);
  const transferServiceRef = useRef<FileTransferService | null>(null);

  const prepareManifest = useCallback(async (files: File[]): Promise<TransferManifest> => {
    const fileMetas: FileMetadata[] = [];
    let totalBytes = 0;

    for (let i = 0; i < files.length; i++) {
      const f = files[i]!;
      totalBytes += f.size;
      const chunkCount = Math.ceil(f.size / DEFAULT_CHUNK_SIZE) || 1;
      
      fileMetas.push({
        id: crypto.randomUUID(),
        name: f.name,
        path: (f as any).webkitRelativePath || f.name,
        size: f.size,
        type: f.type || 'application/octet-stream',
        chunkCount,
        chunkSize: DEFAULT_CHUNK_SIZE,
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
    if (!transport) throw new Error('Transfer transport is not open');

    const service = new FileTransferService(transport);
    transferServiceRef.current = service;

    await service.sendFiles(files, (p) => {
      setProgress({ ...p });
    });
  }, [transport]);

  const startReceiving = useCallback(async (incomingManifest: TransferManifest) => {
    if (!transport) throw new Error('Transfer transport is not open');

    const service = new FileTransferService(transport);
    transferServiceRef.current = service;

    await service.receiveFiles(
      incomingManifest,
      (p) => {
        setProgress({ ...p });
      },
      (_fileIndex, metadata, blob) => {
        // Collect into receivedFiles list for ZIP & inline preview
        setReceivedFiles((prev) => [
          ...prev,
          {
            name: metadata.name,
            path: metadata.path,
            size: metadata.size,
            type: metadata.type,
            blob,
            sha256: metadata.sha256,
          },
        ]);
        // Trigger direct download
        FileTransferService.triggerDownload(blob, metadata.name);
      }
    );
  }, [transport]);

  const cancel = useCallback(() => {
    transferServiceRef.current?.cancel();
    setProgress((prev) => prev ? { ...prev, status: 'CANCELLED' } : undefined);
  }, []);

  return {
    progress,
    setProgress,
    manifest,
    setManifest,
    receivedFiles,
    prepareManifest,
    startSending,
    startReceiving,
    cancel,
  };
}
