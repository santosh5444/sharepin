/**
 * Stream Compression Utility
 * Uses native Web API CompressionStream / DecompressionStream
 * for on-the-fly hardware-accelerated memory compression.
 */

export async function compressChunk(data: Uint8Array): Promise<Uint8Array | null> {
  if (typeof CompressionStream === 'undefined') return null;
  try {
    const cs = new CompressionStream('deflate-raw');
    const writer = cs.writable.getWriter();
    writer.write(data as any);
    writer.close();
    const compressed = await new Response(cs.readable).arrayBuffer();
    const result = new Uint8Array(compressed);
    // Only use compressed if it genuinely reduces transfer payload by at least 64 bytes
    if (result.byteLength < data.byteLength - 64) {
      return result;
    }
  } catch {
    // Graceful fallback to uncompressed
  }
  return null;
}

export async function decompressChunk(data: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream === 'undefined') return data;
  try {
    const ds = new DecompressionStream('deflate-raw');
    const writer = ds.writable.getWriter();
    writer.write(data as any);
    writer.close();
    const decompressed = await new Response(ds.readable).arrayBuffer();
    return new Uint8Array(decompressed);
  } catch {
    return data;
  }
}
