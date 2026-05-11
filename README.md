# Vela Wallet

A self-custodial smart wallet for EVM networks, built with React Native and Expo.

Vela Wallet uses ERC-4337 account abstraction with WebAuthn (passkey) authentication — no seed phrases, no private keys to manage.

## Get Started

1. Install dependencies

   ```bash
   npm install
   ```

2. Start the app

   ```bash
   npx expo start
   ```

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
