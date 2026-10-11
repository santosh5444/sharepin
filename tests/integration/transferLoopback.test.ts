import { describe, it, expect } from 'vitest';
import { packChunk, unpackPacket } from '../../src/utils/packetProtocol';
import { computeSHA256 } from '../../src/utils/fileIntegrity';
import { PacketType, DEFAULT_CHUNK_SIZE } from '../../src/types/transfer';

describe('Transfer Pipeline Loopback Integration', () => {
  it('streams multi-chunk binary file and verifies SHA-256 checksum', async () => {
    // Generate 150 KiB mock file data (spans 3 chunks of 64 KiB)
    const totalSize = 150 * 1024;
    const testData = new Uint8Array(totalSize);
    for (let i = 0; i < totalSize; i++) {
      testData[i] = i % 256;
    }

    const expectedHash = await computeSHA256(testData);

    // Simulate sender slicing and packing
    const totalChunks = Math.ceil(totalSize / DEFAULT_CHUNK_SIZE);
    const sentPackets: Uint8Array[] = [];

    for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
      const start = chunkIndex * DEFAULT_CHUNK_SIZE;
      const end = Math.min(start + DEFAULT_CHUNK_SIZE, totalSize);
      const slice = testData.subarray(start, end);

      const packet = packChunk(PacketType.FILE_CHUNK, 0, chunkIndex, slice);
      sentPackets.push(packet);
    }

    // Simulate receiver unpacking and reconstructing
    const receivedChunks: Uint8Array[] = [];
    let receivedBytes = 0;

    for (const packet of sentPackets) {
      const unpacked = unpackPacket(packet);
      expect(unpacked).not.toBeNull();
      expect(unpacked?.type).toBe(PacketType.FILE_CHUNK);
      receivedChunks.push(unpacked!.payload);
      receivedBytes += unpacked!.payloadLength;
    }

    expect(receivedBytes).toBe(totalSize);

    // Reconstruct into single buffer
    const reconstructed = new Uint8Array(totalSize);
    let offset = 0;
    for (const chunk of receivedChunks) {
      reconstructed.set(chunk, offset);
      offset += chunk.byteLength;
    }

    // Verify SHA-256 integrity match
    const actualHash = await computeSHA256(reconstructed);
    expect(actualHash).toBe(expectedHash);
  });
});
