import { describe, it, expect } from 'vitest';
import { packChunk, unpackPacket } from '../../src/utils/packetProtocol';
import { PacketType, HEADER_SIZE } from '../../src/types/transfer';

describe('WebRTC Binary Packet Protocol Framing', () => {
  it('correctly packs and unpacks a binary file chunk', () => {
    const originalPayload = new Uint8Array([10, 20, 30, 40, 50, 60, 70, 80]);
    const fileIndex = 3;
    const chunkIndex = 42;

    const packed = packChunk(PacketType.FILE_CHUNK, fileIndex, chunkIndex, originalPayload);

    expect(packed.byteLength).toBe(HEADER_SIZE + originalPayload.byteLength);

    const unpacked = unpackPacket(packed);
    expect(unpacked).not.toBeNull();
    expect(unpacked?.type).toBe(PacketType.FILE_CHUNK);
    expect(unpacked?.fileIndex).toBe(fileIndex);
    expect(unpacked?.chunkIndex).toBe(chunkIndex);
    expect(unpacked?.payloadLength).toBe(originalPayload.byteLength);
    expect(Array.from(unpacked!.payload)).toEqual(Array.from(originalPayload));
  });

  it('rejects packets with invalid magic byte header', () => {
    const invalidBuffer = new Uint8Array(HEADER_SIZE + 10);
    // Invalid magic
    invalidBuffer[0] = 0x00;
    invalidBuffer[1] = 0x00;
    invalidBuffer[2] = 0x00;
    invalidBuffer[3] = 0x00;

    const unpacked = unpackPacket(invalidBuffer);
    expect(unpacked).toBeNull();
  });

  it('rejects truncated packets shorter than header size', () => {
    const truncatedBuffer = new Uint8Array(10);
    const unpacked = unpackPacket(truncatedBuffer);
    expect(unpacked).toBeNull();
  });
});
