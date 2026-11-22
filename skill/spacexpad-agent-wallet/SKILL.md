---
name: spacexpad-agent-wallet
description: Use the SpaceXpad agent wallet through its local MCP server. Pair with a PAIR_CODE, then read balances, sign, or send. Omit network to use mainnet. Pass testnet or devnet only when the user explicitly asked.
---

# SpaceXpad agent wallet

The wallet is a Chrome extension for the launchpad at [https://spacexpad.xyz/](https://spacexpad.xyz/). Privy holds the keys. Install the MCP server `spacexpad-agent-wallet` on the agent device first, and point it at the authorization Worker with `SPACEXPAD_AUTH_URL`. Use the user's computer only when the agent has no runtime. The reserved public document is `https://spacexpad.xyz/agent-wallet/skill.md` and it is not published. The review copy in this repo is `docs/agent-wallet/skill.md`. Do not use the launchpad's `/skill`, `/skill.md`, or `/agents` pages for this extension.

A successfully bound agent that the user has explicitly allowed to sign offline can complete `spacexpad_sign_message`, `spacexpad_sign_transaction`, and `spacexpad_send_transaction` while Chrome is closed. Unbound, revoked, and paused requests are rejected and nothing is signed. Offline sends outside the whitelist or over the native amount cap are not signed and are not queued. Loopback `http://127.0.0.1:47321` remains the fallback when offline signing was not granted and the extension is open.

## Install and run

From a checkout of this repository:

```bash
npm install
npm run build
SPACEXPAD_AUTH_URL=https://<authorization-worker> node --experimental-strip-types mcp/src/index.ts
```

Do not put a Privy app secret or authorization private key in this command or in the extension. Those stay in Worker secrets.

`npm run mcp` is the same process. Cursor or Claude Desktop:

```json
{
  "mcpServers": {
    "spacexpad-agent-wallet": {
      "command": "node",
      "args": ["--experimental-strip-types", "mcp/src/index.ts"],
      "cwd": "<absolute path to this repository>"
    }
  }
}
```

The process prints a bridge token on stderr and writes `~/.spacexpad-agent-wallet/bridge.json`. The extension adopts that token from the local server on its own. Do not ask the user to paste a bridge token into Settings, and do not put the token in chat. The bridge accepts loopback clients only. `GET /v1/health` and `GET /v1/bootstrap` do not require the bearer token. Every other route does.

Discover tools from the running server. It registers only:

- `spacexpad_pair`
- `spacexpad_get_addresses`
- `spacexpad_get_balance`
- `spacexpad_sign_transaction`
- `spacexpad_send_transaction`
- `spacexpad_sign_message`

## Pair first

1. The user copies a prompt from the extension. It contains `PAIR_CODE:`.
2. Call `spacexpad_pair` with that code and your agent name.
3. Show the returned `spx_bind_...` token to the user and wait until they paste it into the extension bind screen. Do not ask them to paste a bridge token into Settings.
4. Do not call the other tools until that bind succeeds.

The code expires about 30 minutes after it was copied. The user can remove a binding in the extension.

## Mainnet unless the user names a test network

`chain` is required: `solana`, `ethereum`, `base`, or `bnb`.

Omit `network` to use mainnet. Do not pass `testnet` or `devnet` unless the user explicitly asked for that cluster.

Solana test traffic is `devnet`, not `testnet`. Ethereum and Base `testnet` means Sepolia. BNB Chain `testnet` means BSC testnet. `devnet` is only valid for Solana.

## Tools

- `spacexpad_get_addresses` — Solana address, and the one EVM address shared by Ethereum, Base, and BNB Chain.
- `spacexpad_get_balance` — native balance plus other fungible tokens. A zero native balance is a real read. If `tokenListError` is set, say that the token list failed instead of claiming the wallet holds only the native asset.
- `spacexpad_sign_transaction` — sign only. Return the signed transaction. Do not tell the user it was sent.
- `spacexpad_send_transaction` — sign and submit. Report a hash only if the tool result includes one. Status `submitted` means the RPC accepted it, not that it is confirmed.
- `spacexpad_sign_message` — Ed25519-sign arbitrary bytes with the bound Solana wallet. `chain` must be `solana`. Omit `network` for mainnet; Solana test traffic is `devnet`. `encoding` defaults to `utf8` and signs those exact bytes with no prefix. `signature` in the result is base64, which is the `signature` field for `POST https://spacexpad.xyz/api/agent/verify` together with `wallet` set to `publicKey`. `signatureBase58` is the same bytes. After an explicit offline grant, this can complete while Chrome is closed. Do not substitute a transaction signature.

`kind` is `native_transfer` (`to` + human `amount`) or `serialized` (hex or base64 transaction).

## Failures

Repeat the tool error. Common ones: extension not connected, bridge token mismatch, binding not recognized, binding revoked, agents paused, whitelist miss, USD limit, missing price, user not signed in, RPC failure, Solana `testnet`, EVM `devnet`. Never invent a transaction hash or a balance.
