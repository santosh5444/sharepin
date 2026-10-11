# SharePin 📌

> **Fast, private, peer-to-peer file sharing with a 5-digit PIN.**  
> No accounts. No cloud storage. No file size limits.

[![Live Demo](https://img.shields.io/badge/Live%20Demo-sharepin.pages.dev-blue?style=flat-square)](https://sharepin.pages.dev)
[![License: MIT](https://img.shields.io/badge/License-MIT-emerald.svg?style=flat-square)](LICENSE)
[![Tests Passing](https://img.shields.io/badge/Tests-24%20passed-brightgreen?style=flat-square)](tests)

SharePin lets you transfer files directly between your phone, laptop, tablet, or friend's device in seconds. Just pick your files, share a temporary 5-digit PIN (or scan a QR code), and your files stream directly device-to-device.

---

## 🚀 How It Works (In 3 Simple Steps)

1. **Select Your Files**: Drag & drop photos, videos, documents, or entire folders on the sender device.
2. **Share the 5-Digit PIN**: A temporary PIN and QR code appear on screen (valid for 3 minutes).
3. **Receive Directly**: Enter the PIN or scan the QR code on the receiving device. Files transfer directly between both devices at maximum speed!

---

## ✨ Features

- 🔒 **100% Private & Direct**: Files transfer directly between devices using encrypted WebRTC. Your files **never touch our servers or the cloud**.
- 🚫 **No Accounts Required**: No email, passwords, phone numbers, or sign-ups. Open the site and start sharing immediately.
- 📱 **QR Code Scan-to-Receive**: Don't want to type a PIN? Just point your phone camera at the QR code to connect instantly.
- ⚡ **Realtime Speed & ETA**: Live transfer speed graph, progress bar, and estimated time remaining.
- 🖼️ **In-Browser File Previews**: Preview photos, audio, videos, and PDFs before saving.
- 📦 **Send Multiple Files or Folders**: Send folders or multi-file batches, with single-click "Download All as ZIP".
- 🔔 **Audio Feedback**: Pleasant audio chime notifies you the moment your transfer finishes.
- ⏱️ **Auto-Expiring PINs**: Numeric 5-digit PINs expire after 3 minutes for maximum privacy.
- 🆓 **100% Free**: Zero recurring costs, no subscriptions, and no paywalls.

---

## 🛠️ Quick Start (Run Locally)

### Prerequisites
- [Node.js](https://nodejs.org/) (version 18 or higher)
- npm

### 1. Clone & Install
```bash
git clone https://github.com/santosh5444/sharepin.git
cd sharepin
npm install
```

### 2. Start Development Server
```bash
npm run dev
```
Open **http://localhost:5173** in your browser to test sending and receiving between tabs!

### 3. Run Automated Tests
```bash
npm run test
```

---

## 💻 Tech Stack

- **Frontend**: React 19, TypeScript, Vite, Tailwind CSS, Lucide Icons
- **Direct P2P Engine**: WebRTC DataChannels (Encrypted peer-to-peer data streaming)
- **Signaling Hub**: Cloudflare Workers & Durable Objects (Lightweight connection pairing only)
- **Archive Engine**: fflate (High-speed in-browser ZIP generation)

---

## 🔒 Privacy & Security

- **Direct End-to-End Encryption**: Every transfer is encrypted peer-to-peer via standard WebRTC DTLS/SRTP protocols.
- **Zero Permanent Storage**: We do not store files, filenames, or user data on any server.
- **Sender Approval**: The sender has full control to approve or cancel the connection before any files begin streaming.

---

## 📄 License

This project is licensed under the MIT License - feel free to use and contribute!
