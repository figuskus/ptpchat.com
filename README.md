# PTPChat - P2P Random Chat

Meet and chat with random strangers instantly. No accounts, no tracking, just pure peer-to-peer communication.

## Features

- 🎲 **Random Matching** - Get paired with a random stranger instantly
- 🔒 **P2P Encryption** - Messages travel directly between browsers via WebRTC
- ⚡ **Real-time** - Instant message delivery through data channels
- 🌐 **Serverless** - Powered by Cloudflare Workers & Durable Objects
- 🎨 **Modern UI** - Beautiful, responsive Angular interface

## Architecture

```
User A ◄──── WebSocket ────► Cloudflare Durable Object ◄──── WebSocket ────► User B
                                   (Matchmaker)
                                        │
                                   "matched!"
                                        │
User A ◄════════════════ WebRTC P2P Data Channel ════════════════► User B
```

## Tech Stack

- **Frontend**: Angular 17+ (Standalone Components)
- **Hosting**: Cloudflare Pages
- **Signaling**: Cloudflare Workers + Durable Objects
- **P2P**: WebRTC Data Channels

## Quick Start

### Prerequisites

- Node.js 18+
- npm or pnpm
- Cloudflare account (free tier works)
- Wrangler CLI (`npm install -g wrangler`)

### Development

1. **Install dependencies**:
   ```bash
   cd frontend && npm install
   cd ../worker && npm install
   ```

2. **Run the worker locally**:
   ```bash
   cd worker
   npm run dev
   ```

3. **Run Angular dev server** (in another terminal):
   ```bash
   cd frontend
   npm start
   ```

4. Open `http://localhost:4200`

### Deployment

1. **Login to Cloudflare**:
   ```bash
   wrangler login
   ```

2. **Deploy the worker**:
   ```bash
   cd worker
   npm run deploy
   ```

3. **Update the worker URL** in `frontend/src/environments/environment.prod.ts`

4. **Deploy the frontend**:
   ```bash
   npm run deploy:frontend
   ```

## Environment Configuration

Update the worker URL in:
- `frontend/src/environments/environment.ts` (development)
- `frontend/src/environments/environment.prod.ts` (production)

## License

MIT
