import { PACKET_MAGIC, PacketType, HEADER_SIZE } from '../types/transfer';

export interface UnpackedPacket {
  type: PacketType;
  flags: number;
  fileIndex: number;
  chunkIndex: number;
  payloadLength: number;
  payload: Uint8Array;
}

/**
 * Packs a chunk of binary data with a 20-byte protocol header.
 */
export function packChunk(
  type: PacketType,
  fileIndex: number,
  chunkIndex: number,
  payload: Uint8Array,
  flags = 0
): Uint8Array {
  const packet = new Uint8Array(HEADER_SIZE + payload.byteLength);
  const view = new DataView(packet.buffer, packet.byteOffset, packet.byteLength);

  // [0..3] Magic: "SPIN" (0x5350494E)
  view.setUint32(0, PACKET_MAGIC, false);

  // [4] Packet Type
  view.setUint8(4, type);

  // [5] Flags (0x01 = Compressed with Deflate)
  view.setUint8(5, flags);

  // [6..7] Reserved (0)
  view.setUint16(6, 0, false);

  // [8..11] File Index
  view.setUint32(8, fileIndex, false);

  // [12..15] Chunk Index
  view.setUint32(12, chunkIndex, false);

  // [16..19] Payload Length
  view.setUint32(16, payload.byteLength, false);

  // [20..] Payload bytes
  packet.set(payload, HEADER_SIZE);

  return packet;
}

/**
 * Unpacks an incoming packet buffer from RTCDataChannel.
 */
export function unpackPacket(buffer: ArrayBuffer | Uint8Array): UnpackedPacket | null {
  const uint8 = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);

  if (uint8.byteLength < HEADER_SIZE) {
    return null; // Malformed / truncated packet
  }

  const view = new DataView(uint8.buffer, uint8.byteOffset, uint8.byteLength);

  const magic = view.getUint32(0, false);
  if (magic !== PACKET_MAGIC) {
    return null; // Invalid magic header
  }

  const type = view.getUint8(4) as PacketType;
  const flags = view.getUint8(5);
  const fileIndex = view.getUint32(8, false);
  const chunkIndex = view.getUint32(12, false);
  const payloadLength = view.getUint32(16, false);

  if (uint8.byteLength < HEADER_SIZE + payloadLength) {
    return null; // Truncated payload
  }

  const payload = uint8.subarray(HEADER_SIZE, HEADER_SIZE + payloadLength);

  return {
    type,
    flags,
    fileIndex,
    chunkIndex,
    payloadLength,
    payload,
  };
}
