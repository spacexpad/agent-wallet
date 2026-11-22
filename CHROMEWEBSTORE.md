# Chrome Web Store submission

This is the copy source for the Chrome Developer Dashboard. Publishing assigns a new extension ID. The unpacked ID pinned by the `key` in `public/manifest.json` stays `kgjgdglopjkfahcipgkpnnkenjnoineo`. Do not edit that `key`. The store zip from `npm run pack:store` omits `key` so Chrome assigns the store ID. The source manifest is unchanged.

Privy App ID (public): `cmwqh29x000hj0glajlwjht0s`

After the dashboard shows the new extension ID, and before you publish, add both of these on that Privy app:

- Allowed origin: `chrome-extension://<new-id>/`
- Allowed OAuth redirect: `https://<new-id>.chromiumapp.org/`

Google login fails if those two are missing. You can leave the unpacked origin in place for local development. Do not put a Privy App Secret, an authorization private key, a bridge token, or a PAIR_CODE in the dashboard text, the zip, or a screenshot.

The SpaceXpad website is still on Solana devnet. This extension shows mainnet balances by default, and agent tools use mainnet unless the request names devnet or testnet. Do not describe the launchpad as a live mainnet product.

Privacy URL to enter after it is hosted: `https://spacexpad.xyz/agent-wallet/privacy`

Host `docs/agent-wallet/privacy.html` at that path only. Do not replace `/`, `/skill`, `/skill.md`, or `/agents`. This repo has no skill Worker. `worker/` is the authorization service at `https://spacexpad-agent-wallet-auth.timmy2048.workers.dev` and is not the site. Do not deploy it from this change.

## Dashboard fields

**Item name:** SpaceXpad Agent Wallet

The manifest name is `SpaceXpad agent wallet`. Either string is accurate. The popup wordmark is `SpaceXpad Agent Wallet`.

**Summary (132 characters, also the manifest description):**

```
Keyless multi-chain wallet for agents. Privy holds the keys. You set the risk policy.
```

**Category:** Productivity

**Language:** English

The popup also offers 简体中文 and 繁體中文. The store listing language is English.

**Detailed description:**

```
SpaceXpad Agent Wallet is a keyless wallet for Solana, Ethereum, Base, and BNB Chain. You sign in with email or Google. Privy creates the embedded wallets and holds the keys. The extension never asks for a seed phrase and never shows one.

The popup shows mainnet balances by default. A paired agent can read balances, request a signature, or submit a transaction. Those tools use mainnet unless the request explicitly names devnet or testnet. The SpaceXpad website is a separate product and is still on Solana devnet. This extension does not make that site a mainnet launchpad.

Pair an agent by copying a short install prompt from the extension. The prompt includes a PAIR_CODE that expires in 30 minutes. Install the MCP server on the agent's own device first. Use your computer only when that agent has no device of its own. The extension adopts its local bridge token by itself. You are not asked to paste a bridge token into Settings.

Offline signing is on by default after you sign in and an agent is bound. That agent can sign and send with no confirmation popup, including while Chrome is closed. You can turn offline signing off. An unbound, revoked, or paused request is rejected and nothing is signed.

The default risk policy is full access. An empty destination whitelist does not block signing. You can turn on a single-transaction USD limit, a daily USD limit, and a whitelist. The kill switch pauses every agent. If a limit is on and a price is missing, the extension refuses the signature. It does not report a transaction hash it did not receive.

Agent setup: https://spacexpad.xyz/agent-wallet/skill.md
Privacy: https://spacexpad.xyz/agent-wallet/privacy
```

## Single purpose

```
Give the signed-in user Privy embedded wallets for Solana, Ethereum, Base, and BNB Chain, and let a paired agent read balances and request signatures or sends under the risk policy stored in this extension.
```

## Permission justifications

There is no `tabs`, `history`, `<all_urls>`, or content script.

| Permission | Plain-English justification |
| --- | --- |
| `storage` | Saves this browser's language, display name, risk policy, bound agents, recent agent activity, cached balances, the loopback bridge token, and a local owner key for the authorization service. The Privy SDK also keeps the login session in extension local storage. Nothing here is a seed or an exported private key. |
| `identity` | Google sign-in is Privy's OAuth. Chrome only completes that redirect through `chrome.identity`, at `https://<extension-id>.chromiumapp.org/`. The extension does not read Google contacts or any other identity profile. |
| `offscreen` | An offscreen document keeps the Privy session and the local agent bridge available after the toolbar popup closes. Chrome's offscreen reason is local storage. |
| `alarms` | A one-minute alarm recreates that offscreen document if Chrome suspends it, so a paired agent can still reach an open extension. |
| `clipboardWrite` | Copy writes either a public wallet address or the install prompt (including its 30-minute PAIR_CODE) to the clipboard when you click the control. The extension does not read the clipboard. |

`action` is the toolbar popup (`popup.html`). It is not an optional permission.

## Host permission justifications

| Host | Why it is required |
| --- | --- |
| `https://auth.privy.io/*` | Privy login iframe and session. This is the remote frame disclosed below. |
| `https://api.privy.io/*` | Privy API for the signed-in user and embedded-wallet creation. |
| `https://*.privy.io/*` | The Privy SDK also calls other `privy.io` hosts while the iframe and embedded wallets start. Listing only `auth` and `api` is not enough for that client. The extension does not use this pattern to browse the web. |
| `https://*.rpc.privy.systems/*` | Embedded-wallet RPC. The SDK uses chain hosts such as `solana-mainnet.rpc.privy.systems` and `solana-devnet.rpc.privy.systems`, plus the matching EVM hosts. |
| `https://solana-rpc.publicnode.com/*` | Solana mainnet balance and transaction broadcast. The public Solana Labs mainnet RPC rejects a browser Origin, so the extension does not call it. |
| `https://api.devnet.solana.com/*` | Solana devnet balance or broadcast only when a request explicitly names devnet. |
| `https://ethereum-rpc.publicnode.com/*` | Ethereum mainnet balance and broadcast. |
| `https://ethereum-sepolia-rpc.publicnode.com/*` | Ethereum Sepolia, only when a request explicitly names testnet. |
| `https://base-rpc.publicnode.com/*` | Base mainnet balance and broadcast. |
| `https://base-sepolia-rpc.publicnode.com/*` | Base Sepolia, only when a request explicitly names testnet. |
| `https://bsc-rpc.publicnode.com/*` | BNB Chain mainnet balance and broadcast. |
| `https://bsc-testnet-rpc.publicnode.com/*` | BNB Chain testnet, only when a request explicitly names testnet. |
| `https://eth.blockscout.com/*` | Ethereum mainnet fungible-token list for the public address. |
| `https://eth-sepolia.blockscout.com/*` | Ethereum Sepolia token list, only after an explicit testnet request. |
| `https://base.blockscout.com/*` | Base mainnet fungible-token list. |
| `https://base-sepolia.blockscout.com/*` | Base Sepolia token list, only after an explicit testnet request. |
| `https://lite-api.jup.ag/*` | Jupiter public holdings. Used only as a fallback when a Solana mainnet token-account read is blocked. It receives the Solana address. |
| `https://api.binplorer.com/*` | BNB Chain fungible-token list. Blockscout's BNB API is not used, because `bsc.blockscout.com` answers 404. The request uses Binplorer's published `apiKey=freekey` query parameter. That value is not a SpaceXpad or Privy secret. |
| `https://coins.llama.fi/*` | DefiLlama prices for a USD figure on screen and for a USD limit check. The request sends a public price id or token contract, not the user's wallet address. |
| `http://127.0.0.1:47321/*` | Local MCP bridge on the same computer. It is not a remote server. The extension reads the bridge token from loopback and does not ask you to paste it into Settings. |
| `https://spacexpad-agent-wallet-auth.timmy2048.workers.dev/*` | Authorization service for pairing, the offline grant, policy updates, revoke, and sign or send while the extension is closed. This replaced `https://*.workers.dev/*`. No other workers.dev host is called. |

Removed because the extension never requests them: `https://api.mainnet-beta.solana.com/*`, `https://api.mainnet.solana.com/*`, `https://bsc.blockscout.com/*`, and `https://bsc-testnet.blockscout.com/*`.

## Remote code

Extension pages use `script-src 'self' 'wasm-unsafe-eval'`. The package does not execute a remotely hosted extension script.

Privy still runs its wallet iframe from `https://auth.privy.io`. That frame is the key-holding component. Declare it as remote code in the dashboard: the extension shows Privy's embedded-wallet iframe so Privy can hold the keys and sign. The extension does not receive the seed.

These loaders are absent from the package. The build stubs the packages and rewrites leftover URLs:

- Telegram login (`telegram-login.js`) is not enabled.
- Cloudflare Turnstile (`challenges.cloudflare.com`) is not loaded.
- hCaptcha (`js.hcaptcha.com`) is not loaded.
- Stripe (`crypto-js.stripe.com`, `js.stripe.com`, `issuing-key.stripe.com`) is not loaded.

`npm run pack:store` searches the zip for those strings, for private-key material, and for the unpacked manifest key. Do not upload a zip that fails that scan. In the Privy dashboard, keep CAPTCHA and Telegram login disabled for app `cmwqh29x000hj0glajlwjht0s`.

## Privacy and data-use form

Policy URL: `https://spacexpad.xyz/agent-wallet/privacy`

The page to publish is `docs/agent-wallet/privacy.html`. `PRIVACY.md` is the same text. It is not legal advice.

Certifications to check:

- I do not sell or transfer user data to third parties, outside of the approved use cases.
- I do not use or transfer user data for purposes that are unrelated to my item's single purpose.
- I do not use or transfer user data to determine creditworthiness or for lending purposes.

| Data type | Collected? | What, and where it goes |
| --- | --- | --- |
| Personally identifiable information | Yes | Email address, and the Google account when you choose Google. Privy collects it for login. The extension stores the email and Privy user id in `chrome.storage.local` to label this profile. |
| Health information | No | |
| Financial and payment information | Yes | Public wallet addresses, balances, and the transaction or message an agent asks to sign or send. Used for the wallet. Sent to the RPC, Blockscout, Jupiter, or Binplorer hosts above when that read or broadcast runs, and to the authorization Worker when offline signing runs. |
| Authentication information | Yes | Privy session in extension local storage. A local owner key and binding token authorize the Worker. These are not wallet private keys. |
| Personal communications | No | |
| Location | No | |
| Web history | No | |
| User activity | Yes, locally | The extension stores recent agent actions (method, chain, detail, and a hash when one was returned). It does not read browsing history or page content. |
| Website content | No | |

Data is not sold. It is not used for advertising. It is not used for credit. Sharing is only with the processors named in the privacy policy, for login, balances, prices, and signing.

## Assets

- [x] Icons `public/icons/icon-16.png`, `icon-32.png`, `icon-48.png`, `icon-128.png`, from `assets/spacexpad-x-avatar.png`
- [x] `store/screenshots/sign-in.png` — 1280×800, the sign-in screen
- [x] `store/screenshots/assets.png` — 1280×800, assets with the address popover open
- [x] `store/screenshots/settings-home.png` — 1280×800, Settings home (row list and log out)
- [x] `store/screenshots/settings-risk.png` — 1280×800, risk policy subpage (full access and pause)
- [x] `store/screenshots/agent.png` — 1280×800, Agent tab with offline signing
- [x] `store/screenshots/promo-440x280.png` — optional small promo tile
- [ ] Privacy policy live at `https://spacexpad.xyz/agent-wallet/privacy` (coordinator hosts the HTML; do not deploy from this repo)
- [ ] Privy origin and redirect updated to the new extension ID before publish

Screenshots use fictional demo data for `@nova`. They do not show a real balance, a PAIR_CODE, a bridge token, or a secret. Settings home, the risk-policy subpage, and the Agent tab are separate images because those are separate screens in the popup.

## Produce the zip

```bash
npm run pack:store
```

That builds, copies only `dist`, deletes `key` from the zip's `manifest.json`, and writes `store/spacexpad-agent-wallet-0.1.0.zip`. The zip excludes `.git/`, `node_modules/`, `.env`, `CHROMEWEBSTORE.md`, and source maps. Upload that zip. Do not upload the repository, and do not upload a `dist` folder that still contains `key`.

`public/manifest.json` must still contain `key` after packaging. The unpacked ID stays `kgjgdglopjkfahcipgkpnnkenjnoineo`.

## Version 0.1.0

First release. Keyless Solana, Ethereum, Base, and BNB Chain wallets. Privy holds the keys. Mainnet balances by default. Pair an agent with a 30-minute code. Offline signing is on by default for a bound agent, including while Chrome is closed. Full access is the default policy. A kill switch, optional USD limits, and an optional whitelist are included.

## After upload

1. Upload `store/spacexpad-agent-wallet-0.1.0.zip`.
2. Paste the name, summary, category, language, description, and single purpose from this file.
3. Paste one justification for every permission and every host above.
4. Disclose the `auth.privy.io` iframe. State that CAPTCHA, Telegram, and Stripe loaders are not in the package.
5. Enter the privacy URL and the data-use answers above.
6. Upload the 1280×800 screenshots: sign-in, assets, Settings home, risk policy, and the Agent tab. The promo tile is optional.
7. When Chrome assigns the store extension ID, add `chrome-extension://<new-id>/` and `https://<new-id>.chromiumapp.org/` on Privy app `cmwqh29x000hj0glajlwjht0s` before you publish. Otherwise Google login fails.
8. Confirm email and Google login are on, and CAPTCHA and Telegram login are off.
9. Install the store build and sign in with Google before you release it to users.
