import { describe, it, expect } from 'vitest';
import { PinRegistryDO } from '../../worker/src/pinRegistry';
import { packChunk, unpackPacket } from '../../src/utils/packetProtocol';
import { computeSHA256 } from '../../src/utils/fileIntegrity';
import { PacketType, DEFAULT_CHUNK_SIZE, TransferManifest } from '../../src/types/transfer';

describe('End-to-End Session and Transfer Lifecycle Integration', () => {
  it('executes complete workflow: creation, pairing, lock, and file transfer', async () => {
    const registry = new PinRegistryDO({} as any, {});

    // 1. Sender creates session
    const session = registry.createSession();
    expect(session.success).toBe(true);
    expect(session.pin).toMatch(/^[0-9]{5}$/);
    expect(session.expiresAt).toBeGreaterThan(Date.now());

    // 2. Receiver joins with valid PIN
    const joinResult = registry.joinSession(session.pin!);
    expect(joinResult.success).toBe(true);
    expect(joinResult.sessionId).toBe(session.sessionId);
    expect(joinResult.receiverToken).toBeDefined();

    // 3. Security: Second receiver attempting same PIN must be rejected
    const imposterJoin = registry.joinSession(session.pin!);
    expect(imposterJoin.success).toBe(false);
    expect(imposterJoin.errorCode).toBe('ALREADY_PAIRED');

    // 4. Token validation for signaling access
    expect(registry.validateToken(session.sessionId!, session.senderToken!, 'sender')).toBe(true);
    expect(registry.validateToken(session.sessionId!, joinResult.receiverToken!, 'receiver')).toBe(true);

    // 5. Transfer Manifest creation
    const fileBytes = new TextEncoder().encode('SharePin direct file transfer content!');
    const expectedSha256 = await computeSHA256(fileBytes);

    const manifest: TransferManifest = {
      manifestId: 'test-manifest-1',
      totalFiles: 1,
      totalBytes: fileBytes.byteLength,
      files: [
        {
          id: 'file-1',
          name: 'notes.txt',
          size: fileBytes.byteLength,
          type: 'text/plain',
          chunkCount: 1,
          chunkSize: DEFAULT_CHUNK_SIZE,
          sha256: expectedSha256,
        },
      ],
    };

    // 6. Packet transfer simulation
    const packet = packChunk(PacketType.FILE_CHUNK, 0, 0, fileBytes);
    const unpacked = unpackPacket(packet);

    expect(unpacked).not.toBeNull();
    expect(unpacked?.fileIndex).toBe(0);
    expect(unpacked?.chunkIndex).toBe(0);

    // 7. Receiver verifies SHA-256
    const receivedSha256 = await computeSHA256(unpacked!.payload);
    expect(receivedSha256).toBe(manifest.files[0]!.sha256);
  });
});
