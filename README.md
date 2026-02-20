# Real-Time-Chat-Module

React Native (Expo) real-time chat module with Socket.IO backend, optimistic messaging, pagination, delivery/read status, offline queue, and large-conversation performance via `FlashList`.

## What’s included

- Real-time messaging (Socket.IO)
- Optimistic UI: `queued/sending/sent/delivered/read/failed`
- Duplicate prevention (tempId reconciliation)
- Pagination (load older messages)
- Offline queue + retry (persisted in WatermelonDB)
- 24-hour service window restriction (input disabled when expired)
- Scalable state: Redux Toolkit + normalized entities

## Prerequisites

- Node.js + npm
- Android device / emulator (or iOS simulator)
- For real device on Android (LAN testing): optional `adb`
- For remote testing (different network): `ngrok` (or Cloudflare Tunnel)

## Run backend (local)

```bash
npm run server
```

Backend starts on `http://127.0.0.1:3000`.

Health check:

```bash
http://127.0.0.1:3000/health
```

## Run app (dev)

```bash
npm start
```

## Real device testing

### Option A: Same Wi‑Fi (LAN)

1) Start backend: `npm run server`
2) Make sure your phone and laptop are on the same Wi‑Fi.
3) Use your laptop’s LAN IP (example `192.168.1.10`) and allow port `3000` in Windows Firewall.
4) In the app → **Users** screen → **Server** card:
   - Paste: `http://192.168.1.10:3000`
   - Tap **Apply**

### Option B: Different network (Gujarat ↔ Kerala) via ngrok

1) Start backend: `npm run server`
2) Start ngrok:

```bash
ngrok http 3000
```

3) Copy the forwarding URL (example):
   - `https://xxxx.ngrok-free.dev`
4) In the app → **Users** screen → **Server** card:
   - Paste the ngrok URL
   - Tap **Apply**

If Apply succeeds:
- ngrok shows increased **Connections**
- backend logs a Socket.IO connection

## Deep link (optional)

The app supports setting the server via deep link:

```
realtimechat://set-server?url=https%3A%2F%2Fxxxx.ngrok-free.dev
```

You can send this link to a tester; tapping it will save the server URL and reconnect.

## How to use (in app)

1) Open **Users**
2) Configure **Server** (once per device)
3) Set **Me** (name + mobile) and tap **Save**
4) Tap **+ Add User** to add a peer
5) Tap the user to open chat

## Troubleshooting

### “websocket error” / “Socket connect timed out”

- Ensure you set the correct server URL in **Users → Server → Apply**
  - Real device: **do not** use `http://localhost:3000`
  - Emulator only: `http://10.0.2.2:3000`
- Verify backend is running: `npm run server`
- Verify the URL works in mobile browser:
  - `https://xxxx.ngrok-free.dev/health` should return JSON
- Some mobile networks block WebSockets; the client allows polling fallback for ngrok/https URLs.

### Messages not appearing / duplicates

- Ensure both devices are connected to the same conversation (same `Me` IDs).
- The module uses `tempId` reconciliation and normalized state to prevent duplicates.

## Notes

- Backend message store is in-memory for demo purposes and resets on server restart.
- Local persistence uses WatermelonDB (SQLite). Uninstalling the app typically clears local data.

