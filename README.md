# SharePin 📌
> **"Share files. Not your storage."**

SharePin is a modern, responsive, zero-permanent-storage file-sharing web application. It enables direct, browser-to-browser peer-to-peer file transfers between devices using a temporary 5-digit PIN.

---

## 🌟 Key Features & Architectural Guarantees

- **No Accounts Required**: No email, phone numbers, passwords, or social login. Open and transfer immediately.
- **Zero Permanent Cloud Storage**: Files **never touch cloud servers**. Payloads flow directly between devices over encrypted WebRTC DataChannels.
- **Temporary 5-Digit PIN**:
  - Cryptographically secure numeric PIN (`00000` to `99999`) generated on the server (`crypto.getRandomValues`).
  - Leading zeros are strictly preserved.
  - Server-authoritative 2-minute joining window.
- **Single-Receiver Enforcement**:
  - Atomic server-side lock prevents duplicate joins. Once a receiver claims a PIN, subsequent join attempts are rejected.
  - Established transfers continue uninterrupted even after the initial 2-minute join window elapses.
- **Sender Approval Protection**: The sender must explicitly approve the receiver's connection request before any file bytes leave the device.
- **Bounded-Memory Streaming Engine**:
  - Does **not** buffer large files in JavaScript RAM.
  - Uses `Blob.slice()` to stream 64 KiB binary chunks.
  - Reactive backpressure management via `RTCDataChannel.bufferedAmount` and `bufferedAmountLowThreshold` (256 KiB threshold / 1 MiB high watermark).
- **Zero Base64 / JSON Overhead**: Chunks are framed with a compact 20-byte binary header (`0x5350494E` "SPIN" magic bytes, packet type, file index, chunk index, payload length).
- **Cryptographic Integrity**: SHA-256 verification verifies incoming files before marking transfers complete.
- **Folder and Multi-File Support**: Preserves relative paths when folders are uploaded via supported browsers.

---

## 🏗️ System Architecture

```
┌────────────────────────────────────────────────────────┐
│                      FRONTEND                          │
│  React 19 + TypeScript (Strict) + Vite + Tailwind CSS  │
└───────────────┬────────────────────────┬───────────────┘
                │                        │
         REST & WebSocket           WebRTC DataChannel
       (Coordination Only)          (Raw File Chunks)
                │                        │
                ▼                        ▼
┌──────────────────────────────┐ ┌──────────────────────────────┐
│  CLOUDFLARE WORKER BACKEND   │ │       PEER DEVICE            │
│ - PinRegistryDO (5-digit PIN)│ │ - Direct P2P Decryption      │
│ - SessionDO (Signaling hub)  │ │ - Streaming Disk Writes      │
│ - Rate Limiting & Expiry     │ │ - SHA-256 Verification       │
└──────────────────────────────┘ └──────────────────────────────┘
```

### Protocol & Binary Framing

RTCDataChannel binary packet structure (20-byte header + binary payload):

| Offset | Size | Field | Description |
|---|---|---|---|
| 0..3 | 4 bytes | Magic Bytes | `0x5350494E` ("SPIN") |
| 4 | 1 byte | Packet Type | `0x01`: FILE_CHUNK, `0x02`: ACK, `0x03`: CANCEL, `0x04`: END_FILE |
| 5 | 1 byte | Flags | Reserved (0x00) |
| 6..7 | 2 bytes | Reserved | Reserved (0x0000) |
| 8..11 | 4 bytes | File Index | Big-endian uint32 |
| 12..15 | 4 bytes | Chunk Index | Big-endian uint32 |
| 16..19 | 4 bytes | Payload Length | Big-endian uint32 |
| 20.. | N bytes | Chunk Payload | Raw binary slice |

---

## 🧪 Testing Suite

SharePin includes comprehensive unit, integration, and end-to-end tests:

- **Unit Tests**:
  - `validation.test.ts`: 5-digit PIN validation (`00000` to `99999`), leading zeros, malicious filename path traversal sanitization, and folder path stacks.
  - `packetProtocol.test.ts`: Binary framing, magic byte validation, packet unpacking.
  - `fileIntegrity.test.ts`: WebCrypto SHA-256 calculation against known vectors.
  - `formatBytes.test.ts`: Format byte sizing, transfer speeds, and duration times.
  - `pinRegistry.test.ts`: PIN generation, single-receiver lock, 2-minute deadline, token authorization.
  - `rateLimiter.test.ts`: Sliding-window rate limiting for join attempts (brute force protection).
- **Integration Tests**:
  - `transferLoopback.test.ts`: Multi-chunk binary file streaming, backpressure, and SHA-256 verification.
  - `endToEndSession.test.ts`: Full lifecycle from session creation to single-receiver claim, manifest transmission, and file transfer.

Run all tests:
```bash
npm run test
```

---

## 🚀 Getting Started Locally

### Prerequisites
- Node.js 18+ (tested on Node v24)
- npm 9+

### 1. Install Dependencies
```bash
npm install
```

### 2. Start Frontend Dev Server
```bash
npm run dev
```
Open [http://localhost:5173](http://localhost:5173) in your browser.

### 3. Run Cloudflare Signaling Worker Locally
```bash
npm run worker:dev
```
The Worker runs locally on `http://localhost:8787` with emulation for Durable Objects and WebSockets.

---

## 🌐 Production Deployment

### 1. Cloudflare Workers (Backend)
1. Authenticate with Wrangler:
   ```bash
   npx wrangler login
   ```
2. Deploy the Worker:
   ```bash
   npm run worker:deploy
   ```
3. Take note of your worker domain (e.g., `https://sharepin-worker.<your-subdomain>.workers.dev`).

### 2. Cloudflare Pages / Static Hosting (Frontend)
1. Build the production bundle:
   ```bash
   npm run build
   ```
2. Configure environment variables in `.env.production` or Cloudflare Pages project settings:
   ```env
   VITE_SIGNALING_HTTP_URL=https://sharepin-worker.<your-subdomain>.workers.dev
   VITE_SIGNALING_WS_URL=wss://sharepin-worker.<your-subdomain>.workers.dev
   ```
3. Deploy the `dist/` directory via Cloudflare Pages:
   ```bash
   npx wrangler pages deploy dist --project-name sharepin
   ```

---

## 💰 Zero-Recurring-Cost Free-Tier Analysis

| Service | Provider | Free Allowance | SharePin Usage | Risk of Cost |
|---|---|---|---|---|
| **Signaling API** | Cloudflare Workers | 100,000 requests / day | ~2-3 HTTP requests per transfer session | Zero (free tier capped) |
| **Session State** | Cloudflare Durable Objects | Included free tier requests | Ephemeral in-memory pairing for 2 minutes | Zero |
| **P2P NAT Traversal**| Google Public STUN | Free public STUN servers | STUN candidate discovery only | Zero |
| **File Storage** | None | N/A | **0 bytes stored in cloud** | Zero |
| **Relay Bandwidth**| Disabled | N/A | Direct P2P only (no paid TURN) | Zero |

---

## ⚠️ Known Limitations & Direct Connectivity Notice

- **Symmetric NAT / Strict Firewalls**: Because SharePin is committed to zero recurring hosting costs, paid TURN relays are deliberately disabled. Devices behind strict corporate firewalls or carrier-grade symmetric NATs that cannot discover direct P2P paths will report a direct connection error rather than secretly uploading your data to a paid relay.
- **Folder Upload Support**: Supported on Chromium-based browsers (Chrome, Edge, Brave) and Firefox desktop via `webkitdirectory`. Mobile browsers currently allow multi-file selection.
- **Browser Memory Limits on Legacy Fallback**: On browsers with File System Access API support (Chrome/Edge), files stream directly to disk. On mobile Safari / older browsers without streaming writable file handles, received files are buffered in IndexedDB/Blob before triggering download.
