---
name: spacexpad-agent-wallet
description: Use the SpaceXpad agent wallet through its local MCP server. Pair with a PAIR_CODE from the extension, then read addresses and balances, sign, or send. Omit network to use mainnet. Pass testnet or devnet only when the user explicitly asked.
---

# SpaceXpad agent wallet

This document is the setup for the SpaceXpad agent wallet Chrome extension. It is separate from the launchpad skill at `https://spacexpad.xyz/skill.md`.

Privy holds the keys. There is no seed phrase, and this service never receives one. Install the MCP server on the agent device first. Use the user's computer only when that agent has no runtime of its own. After the user grants offline signing in the extension, sign and send go to the authorization Worker even if Chrome is closed. The local extension bridge remains the fallback when that grant is not in place and the extension is open.

Intended public URL, not published yet: `https://spacexpad.xyz/agent-wallet/skill.md`

## Install

You need Node.js 22 or newer and a checkout of the `spacexpad-agent-wallet` repository.

```bash
npm install
npm run build
SPACEXPAD_AUTH_URL=https://<authorization-worker> node --experimental-strip-types mcp/src/index.ts
```

Set `SPACEXPAD_AUTH_URL` to the authorization Worker. Omit it only when this MCP and the extension are on the same computer and offline signing is not granted. Do not put a Privy app secret, authorization private key, or bridge token in this command, in chat, or in the extension.

`npm run mcp` starts the same process. Load the unpacked extension from the `dist` folder. The extension id pinned by the manifest key is `kgjgdglopjkfahcipgkpnnkenjnoineo`.

The process speaks MCP on stdin and stdout. It also listens on `http://127.0.0.1:47321`. Only loopback clients are accepted. Every route except `GET /v1/health` and `GET /v1/bootstrap` requires `Authorization: Bearer <bridge token>`. `/v1/bootstrap` exists so the extension can adopt the token. Do not print that token in chat.

The bridge token is printed on stderr and written to `~/.spacexpad-agent-wallet/bridge.json`. The extension adopts that token from the local server on its own. Do not ask the user to paste a bridge token into Settings, do not ask for it in chat, and do not put it in a URL.

Override the port with `SPACEXPAD_BRIDGE_PORT` or the token with `SPACEXPAD_BRIDGE_TOKEN`.

## Client configuration

Cursor or Claude Desktop:

```json
{
  "mcpServers": {
    "spacexpad-agent-wallet": {
      "command": "node",
      "args": ["--experimental-strip-types", "mcp/src/index.ts"],
      "cwd": "<absolute path to the spacexpad-agent-wallet repository>"
    }
  }
}
```

After the client connects, discover tools from the server. It registers only these:

- `spacexpad_pair`
- `spacexpad_get_addresses`
- `spacexpad_get_balance`
- `spacexpad_sign_transaction`
- `spacexpad_send_transaction`
- `spacexpad_sign_message`

Do not invent other tool names.

## Pair

1. The user copies a prompt from the extension. It contains `PAIR_CODE:`.
2. Call `spacexpad_pair` with that code and your agent name.
3. Show the returned token that starts with `spx_bind_` and wait until the user pastes it into the extension bind screen. Do not ask them to paste a bridge token into Settings.
4. Do not call the other tools until that bind succeeds.

The code expires about 30 minutes after it was copied. The user can remove the binding in the extension. Do not put the pair code or the binding token in a public URL.

## Mainnet unless the user names a test network

`chain` is required: `solana`, `ethereum`, `base`, or `bnb`.

Omit `network` to use mainnet. The wallet view is mainnet as well. Pass `testnet` or `devnet` only when the user explicitly asked for that cluster. Do not choose a test network on your own.

Solana test traffic is `devnet`, not `testnet`. Ethereum and Base `testnet` means Sepolia. BNB Chain `testnet` means BSC testnet. `devnet` is valid only for Solana.

A successfully bound agent has `spacexpad_sign_message`, `spacexpad_sign_transaction`, and `spacexpad_send_transaction` completed automatically. Offline signing is on by default once the user is logged in and an agent is bound. The extension grants the Privy signer without a separate opt-in click. The user can turn offline signing off in the extension. Chrome can stay closed after that grant. An unbound request, a revoked binding, or a request while the kill switch is on is rejected and nothing is signed, including after Chrome closes. The default risk policy is full access: an empty whitelist does not block sign or send, and there is no default native amount cap. If the user turns on a whitelist or turns off full access, an offline request outside that policy is not signed and is not queued.

## Tools

- `spacexpad_get_addresses` returns the Solana address and the one EVM address shared by Ethereum, Base, and BNB Chain. It does not select a network.
- `spacexpad_get_balance` reads the native balance and other fungible tokens for the chain you pass. A zero native balance is a completed read. If `tokenListError` is set, say the token list failed instead of claiming the wallet holds only the native asset. Solana token symbols that cannot be resolved are a shortened mint. NFTs are not listed.
- `spacexpad_sign_transaction` signs and returns the signed transaction. It does not broadcast. Do not tell the user it was sent.
- `spacexpad_send_transaction` signs and submits. Report a hash only when the result includes one. Status `submitted` means the RPC accepted it, not that it is confirmed.
- `spacexpad_sign_message` signs arbitrary bytes with the bound Solana wallet. It is not a transaction signature. `chain` must be `solana`. Omit `network` for mainnet, or pass `devnet` when the user asked for Solana test traffic. `encoding` defaults to `utf8`: the exact UTF-8 bytes of `message` are signed, with no prefix and no wrapping. Pass `hex` (optional `0x`) or `base64` only when the message is not text. A successfully bound agent is signed automatically. Do not wait for a confirmation click. The result `signature` is base64. `POST https://spacexpad.xyz/api/agent/verify` expects `{ "wallet": "<publicKey>", "signature": "<that base64>" }` because `verifyChallengeWithWalletPubkey` decodes the signature as base64 over the challenge `message` UTF-8 bytes. `signatureBase58` is the same signature bytes. Do not send a transaction signature to that endpoint.

## Manual message-sign check

1. Bind an agent and copy the Solana address from the wallet.
2. `GET https://spacexpad.xyz/api/agent/challenge?wallet=<that address>` and keep the `message` string exactly.
3. Call `spacexpad_sign_message` with `chain: "solana"`, `encoding: "utf8"`, and that `message`. A bound agent signs it automatically. Do not wait for a confirmation click in the extension.
4. `POST https://spacexpad.xyz/api/agent/verify` with `{ "wallet": "<publicKey>", "signature": "<signature>" }` using the base64 `signature` field.
5. A successful session returns `ok: true` and a `sessionToken`. A transaction signature will not pass.

`kind` is `native_transfer` (`to` plus a human `amount`) or `serialized` (a hex or base64 transaction).

## Offline signing

1. On the agent device, run this MCP with `SPACEXPAD_AUTH_URL` set to the authorization Worker.
2. The user copies a prompt from the extension. The extension registers that `PAIR_CODE` with the Worker. The code lasts 30 minutes and is one-time.
3. Call `spacexpad_pair`. Show the `spx_bind_` token and wait until the user pastes it into the extension. Do not ask them to paste a bridge token into Settings.
4. After login and bind, the extension adds this service's Privy key quorum as a signer. That grant is the default. The user can turn it off. Privy keeps the keys.
5. Sign and send can then complete while Chrome is closed. Revoke and pause in the extension take effect immediately on the Worker. Full access is the default. A whitelist or a tighter policy applies only after the user sets one.

The built extension config already contains the authorization service URL `https://spacexpad-agent-wallet-auth.timmy2048.workers.dev` and the key quorum id. Do not ask the user to type those. Set `SPACEXPAD_AUTH_URL` to that same URL when the MCP runs on the agent device. The Worker calls Privy's wallet RPC (`POST /v1/wallets/{wallet_id}/rpc`). The app secret and the P-256 authorization private key are Worker secrets named `PRIVY_APP_SECRET` and `PRIVY_AUTHORIZATION_PRIVATE_KEY`. They are not in the extension or in this document. `PRIVY_APP_ID` and `PRIVY_KEY_QUORUM_ID` are plain Worker variables. Offline Solana sends still use a serialized unsigned transaction. This Worker lives in `worker/` and is deployed separately from this document.

## Failures

Repeat the tool error. Common ones: extension not connected, authorization service unreachable, binding not recognized, binding revoked, agents paused, needs confirmation while the wallet is offline, Solana `testnet`, EVM `devnet`. Never invent a transaction hash, a signature, or a balance.
