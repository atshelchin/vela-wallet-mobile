# Vela Wallet

A self-custodial smart wallet for EVM networks, built with React Native and Expo.

Vela Wallet uses ERC-4337 account abstraction with WebAuthn (passkey) authentication — no seed phrases, no private keys to manage.

Runs on **iOS**, **Android**, and **Web** from a single codebase.

## Get Started

1. Install dependencies

   ```bash
   npm install
   ```

2. Start the app

   ```bash
   # iOS / Android
   npx expo start

   # Web
   npx expo start --web
   ```

## Platform Support

| Feature | iOS | Android | Web |
|---------|-----|---------|-----|
| Passkey (WebAuthn) | Native (ASAuthorization) | Native (Credential Manager) | `navigator.credentials` API |
| Cloud Sync | iCloud Key-Value Store | Google Play BlockStore | IndexedDB (local only) |
| QR Scanner | expo-camera | expo-camera | `getUserMedia` + jsQR |
| Haptic Feedback | expo-haptics | expo-haptics | No-op |
| Clipboard | expo-clipboard | expo-clipboard | `navigator.clipboard` |
| In-App Browser | expo-web-browser | expo-web-browser | `window.open` |
| BLE (DApp Connect) | VelaBLE native module | VelaBLE native module | Not supported (v1) |
| Animated Balance | Reanimated worklet | Reanimated worklet | Plain text (no animation) |

### Web Notes

- **Passkey rpId**: Uses the registrable domain (e.g. `getvela.app`) so passkeys work across subdomains and are consistent with native.
- **Cloud Sync**: Web uses IndexedDB for local persistence. No cross-device sync — accounts are stored in the browser only.
- **DApp Connect**: BLE connection is not available on web. This is planned for a future release.
- **Native APIs**: All platform-specific APIs (Alert, Clipboard, Haptics, AppState, Linking) are abstracted via `src/services/platform.ts`.

## Build for Web (Cloudflare Pages)

1. Build the static web bundle

   ```bash
   npm run build:web
   ```

   Output goes to `dist/`.

2. Deploy with Wrangler CLI

   ```bash
   npx wrangler pages deploy dist --project-name vela-wallet
   ```

   Or connect your GitHub repo in the [Cloudflare Dashboard](https://dash.cloudflare.com) → Pages → Create a project:

   | Setting | Value |
   |---------|-------|
   | Build command | `npm run build:web` |
   | Output directory | `dist` |
   | Environment variable | `NODE_VERSION` = `20` |

## Self-Deploy Service Endpoints

Vela Wallet relies on three backend services. Default instances are provided, but you can deploy your own for full self-custody.

Configure custom endpoints in **Settings > Advanced > Service Endpoints**.

| Service | Description | Repository |
|---------|-------------|------------|
| **Chain Data Index** | Network info, token data, chain logos | [atshelchin/ethereum-data](https://github.com/atshelchin/ethereum-data) |
| **Passkey Index** | Public key storage for cross-device recovery | [atshelchin/webauthnp256-publickey-index.biubiu.tools](https://github.com/atshelchin/webauthnp256-publickey-index.biubiu.tools) |
| **Bundler Service** | ERC-4337 transaction bundler | [atshelchin/vela-bundler](https://github.com/atshelchin/vela-bundler) |

Each service exposes a `/api/health` endpoint for status verification. The wallet validates all three checks before accepting a custom endpoint:

1. **HTTPS** — only secure connections accepted
2. **Reachable** — server responds within 10 seconds
3. **Valid response** — `/api/health` returns the correct `service` identifier and `status: "ok"`
