/**
 * SharePin File Transfer Types & Protocol
 */

export interface FileMetadata {
  id: string;              // UUID or crypto unique ID for this file
  name: string;            // Sanitized file name
  path?: string;           // Relative folder path (if folder transfer)
  size: number;            // Size in bytes
  type: string;            // MIME type
  chunkCount: number;      // Total expected chunks
  chunkSize: number;       // Size per chunk (e.g., 64 KiB)
  sha256?: string;         // Expected SHA-256 (calculated before or during transfer)
  lastModified?: number;
}

export interface TransferManifest {
  manifestId: string;
  files: FileMetadata[];
  totalBytes: number;
  totalFiles: number;
}

export type TransferStatus =
  | 'WAITING_FOR_APPROVAL'
  | 'APPROVED'
  | 'REJECTED'
  | 'TRANSFERRING'
  | 'VERIFYING_INTEGRITY'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'FAILED';

export interface TransferProgress {
  currentFileIndex: number;
  currentFileName: string;
  currentFileBytesTransferred: number;
  currentFileSize: number;
  totalFiles: number;
  totalBytesTransferred: number;
  totalBytes: number;
  speedBps: number;        // Bytes per second
  etaSeconds: number | null;
  status: TransferStatus;
  errorMessage?: string;
}

/**
 * Binary Packet Protocol Header for DataChannel
 * 
 * To maximize throughput and minimize overhead, we frame data channel packets
 * using a compact binary header rather than JSON or Base64 encoding.
 * 
 * Header layout (20 bytes):
 * [0..3]   : Magic bytes 0x53 0x50 0x49 0x4E ("SPIN")
 * [4]      : Packet Type (0x01 = FILE_CHUNK, 0x02 = CHUNK_ACK, 0x03 = CANCEL, 0x04 = END_FILE)
 * [5..8]   : File Index (uint32 big-endian)
 * [8..12]  : Chunk Index (uint32 big-endian)
 * [12..16] : Total Chunks in File (uint32 big-endian)
 * [16..20] : Payload Length (uint32 big-endian)
 * [20..]   : Chunk Raw Binary Data
 */

export const PACKET_MAGIC = 0x5350494e; // "SPIN"

export enum PacketType {
  FILE_CHUNK = 0x01,
  CHUNK_ACK = 0x02,
  CANCEL = 0x03,
  END_FILE = 0x04,
  HANDSHAKE_PROBE = 0x05,
  HANDSHAKE_ACK = 0x06,
  TRANSFER_COMPLETE = 0x07,
}

export const HEADER_SIZE = 20;

// Optimal chunk size for modern WebRTC DataChannel & WebSocket edge relay
export const DEFAULT_CHUNK_SIZE = 128 * 1024; // 128 KiB

// High and low watermarks for high-throughput streaming
export const BUFFERED_AMOUNT_LOW_THRESHOLD = 512 * 1024; // 512 KiB
export const BUFFERED_AMOUNT_HIGH_WATERMARK = 2 * 1024 * 1024; // 2 MiB
