# SpaceXpad agent wallet

The launchpad is [https://spacexpad.xyz/](https://spacexpad.xyz/). On 21 November 2026 these paths were already live and belong to that site: `/` (launch prompts), `/skill` and `/skill.md` (the Solana fair-mint skill), and `/agents` (how agents participate). This extension does not use them.

The official setup document is [https://spacexpad.xyz/agent-wallet/skill.md](https://spacexpad.xyz/agent-wallet/skill.md). It is not `/skill` or `/skill.md`. The copy to host is `docs/agent-wallet/skill.md`. On 22 November 2026 the live page was an older draft that told the user to paste a bridge token into Settings. That instruction is wrong. Pair codes and bridge tokens stay out of that URL. They appear only after someone copies a prompt or starts the local server.

Chrome extension for a keyless multi-chain vault. Privy creates the wallets and signs. A paired agent, through a local MCP server, can read balances, request a signature, or submit a transaction. The extension enforces the risk policy and the kill switch.

Solana, Ethereum, Base, and BNB Chain are supported. The wallet view and agent actions use mainnet unless the user, or the agent prompt, explicitly asks for testnet or devnet. Omitting `network` means mainnet. The server does not rewrite an explicit test network into mainnet, and it does not treat a missing network as a test network. A successfully bound agent has sign and send completed automatically, on mainnet and on devnet or testnet, with no confirmation click. An unbound request, a revoked binding, or a request while the kill switch is on is rejected and nothing is signed.

## Load the unpacked extension

```bash
npm install
npm run build
```

1. Open `chrome://extensions`.
2. Turn on Developer mode.
3. Choose **Load unpacked** and select the `dist` folder.

The unpacked extension ID is pinned by the manifest key:

`kgjgdglopjkfahcipgkpnnkenjnoineo`

Toolbar popup is the console. Gmail sign-in opens a separate window, because Chrome will not finish that OAuth redirect inside the toolbar popup.

`config.example.json` already contains the public development App ID `cmwqh29x000hj0glajlwjht0s`. The build copies that file to `dist/config.json`. There is no App Secret in this repo, and the extension never asks for one. A local `config.json` overrides the example if you create one. If the App ID is missing, the popup shows a setup screen instead of crashing.

## Privy

The development app is `cmwqh29x000hj0glajlwjht0s` on [dashboard.privy.io](https://dashboard.privy.io). Google login is already enabled there with Privy's shared OAuth credentials for this test. Email login still has to be turned on in the dashboard before the email code path works.

Automatic embedded-wallet creation in that dashboard applies only when a user signs in through Privy's own modal. This extension uses custom Google and email screens, so it does not rely on that toggle. `createOnLogin` is off. After authentication the extension calls `createWallet()` from `@privy-io/react-auth` for the EVM wallet and `createWallet()` from `@privy-io/react-auth/solana` for the Solana wallet, and only when that embedded wallet is not already on the user. Ethereum, Base, and BNB Chain then share the EVM address. Solana keeps its own base58 address.

Still required in the Privy dashboard for this unpacked build:

1. Enable **Email** login. Leave the other methods off besides Google.
2. Allowed origins: `chrome-extension://kgjgdglopjkfahcipgkpnnkenjnoineo`
3. Allowed OAuth redirect URL: `https://kgjgdglopjkfahcipgkpnnkenjnoineo.chromiumapp.org/`
4. Disable CAPTCHA and Telegram login so the extension does not expect those scripts.
5. App client: this build does not include a client ID because one was not issued. If login fails asking for an app client, create a client on that app, allow the origin and redirect above, and paste only the client ID into Settings. Do not paste an app secret.
6. Privy's shared Google client may reject this extension redirect. If Gmail returns a redirect error, attach your own Google OAuth client in the Privy Google settings. Keep that client secret in the Privy dashboard.

The unpacked extension ID comes from the public key in `manifest.json`. A later Chrome Web Store publish replaces it, and the origin and redirect above have to be updated to match.

Privy's embedded-wallet client still has to attach to some EVM chain when it loads. That attachment is not a product setting. The popup shows mainnet balances. Before a signature, the extension switches to the chain and cluster for that request and broadcasts through the RPC for that cluster. An omitted cluster is mainnet.

## Using the wallet

Sign in with email first, then Google. The username is a display name edited in Settings after login. The format check is 2–24 letters, numbers, or underscores. There is no account server and no global uniqueness check, so the same display name can exist for someone else. Sign-in and wallet identity use the Privy user id (`auth.userId`) and the Solana plus EVM addresses, not the display name.

The first screen after a new login is bind-agent. Assets stay closed until an agent is bound. There is no skip. A returning user who already has a bound agent opens on assets. Revoking the last agent closes the wallet again; the next open is the bind screen.

The asset home shows one network at a time, Solana by default or the shared EVM address. Copy lives on that switcher. Ethereum, Base, and BNB Chain are not four separate homes. A shown zero is a completed read. A failed RPC stays an error and is not displayed as zero. Solana reads the native balance from a browser-reachable RPC (`https://solana-rpc.publicnode.com`), because `https://api.mainnet-beta.solana.com` returns HTTP 403 when the request has a browser Origin. SPL tokens fall back to Jupiter's public holdings API when the RPC blocks `getTokenAccountsByOwner`. Ethereum and Base still use Blockscout. BNB Chain does not: `https://bsc.blockscout.com` answers HTTP 404 (`default backend - 404`), so the BNB token list comes from Binplorer. NFTs are not listed. If the token index fails, the native balance still shows and the index error is separate.

Bind an agent before the wallet can be used:

1. Start the local MCP server (see below). The extension adopts the bridge token from loopback. Do not paste it into Settings.
2. Copy the install note. It tells the agent to read `https://spacexpad.xyz/agent-wallet/skill.md` and includes `PAIR_CODE`. It expires in 30 minutes.
3. The agent calls `spacexpad_pair` and shows an `spx_bind_...` token.
4. Paste that token into the bind screen. Remove the agent later from the Agent tab to revoke it.

Settings cover language (简体中文, 繁體中文, English), username, the risk policy, and optional RPC endpoints. An empty RPC field keeps that cluster on the public endpoint from the packed config. A URL entered there is stored only in extension local storage and is used for balance, quote, sign, and send on that cluster. It does not change which network the popup shows, and agent requests still use mainnet unless they name a test network. Full access is the default: no USD cap. You can switch on a single-transaction USD limit and a daily USD limit. An optional whitelist allows signing only when each destination is on the list (the recipient for a native transfer, the contract for a call, the mint for an SPL transfer). The kill switch pauses signing and sending for every agent. Balance reads still work. Resume is on the paused line and in Settings.

If a price is missing while a limit is on, the extension refuses the signature. It does not invent a transaction hash.

Offline signing is on by default after login once an agent is bound. The extension grants the Privy signer without a separate opt-in. A bound agent can then sign and send while Chrome is closed, through `https://spacexpad-agent-wallet-auth.timmy2048.workers.dev`. You can turn that off in the Agent tab. Unbound, revoked, and paused requests are still rejected. Install the MCP server on the agent's own device first, with `SPACEXPAD_AUTH_URL` set to that same origin. Use this computer only when the agent has no device of its own. The Worker does not receive an exported private key or the seed. Do not put the Privy App Secret or the authorization private key in the extension.

## MCP and skill

There is no hosted MCP URL. Setup is in `MCP.md`. From this repo:

```bash
npm install
npm run build
node --experimental-strip-types mcp/src/index.ts
```

`npm run mcp` is the same process. It listens on `127.0.0.1:47321`, requires a bearer token on every route except `GET /v1/health` and `GET /v1/bootstrap`, and rejects a non-loopback `Host`. The token is printed on stderr and written to `~/.spacexpad-agent-wallet/bridge.json`. The extension reads it from `/v1/bootstrap`. Do not paste it into Settings. Override the port with `SPACEXPAD_BRIDGE_PORT` or the token with `SPACEXPAD_BRIDGE_TOKEN`.

Cursor or Claude Desktop:

```json
{
  "mcpServers": {
    "spacexpad-agent-wallet": {
      "command": "node",
      "args": ["--experimental-strip-types", "mcp/src/index.ts"],
      "cwd": "/absolute/path/to/this/repo"
    }
  }
}
```

The registered tools are `spacexpad_pair`, `spacexpad_get_addresses`, `spacexpad_get_balance`, `spacexpad_sign_transaction`, `spacexpad_send_transaction`, and `spacexpad_sign_message`. The skill is `skill/spacexpad-agent-wallet/SKILL.md`. `spacexpad_sign_message` signs a Solana message, not a transaction. The review copy to publish at `https://spacexpad.xyz/agent-wallet/skill.md` is `docs/agent-wallet/skill.md`.

Chain strings are `solana`, `ethereum`, `base`, and `bnb`. Omit `network` for mainnet. Solana does not accept `testnet` (use `devnet` only when the user asked for it). EVM chains do not accept `devnet` (Ethereum and Base testnet is Sepolia; BNB Chain testnet is BSC testnet). A bound agent signs and sends without a popup confirmation.

Browser auto-handshake is not in this version. Pairing is the copy-prompt / paste-token flow.

## Develop

```bash
npm test
npm run check
npm run build
```

`npm test` covers mainnet as the omitted cluster, bound-agent signing on an explicit test network, message signing, asset grouping, the risk policy, pairing, and an MCP client that discovers the real tools. `npm run check` rejects `.then(`, `eval(`, and inline `onclick` in our sources.

Icons are generated by `npm run icons` from `assets/spacexpad-x-avatar.png`. If that file is missing, the script stops. It does not fall back to another drawing. The manifest key is unchanged, so the unpacked extension id stays `kgjgdglopjkfahcipgkpnnkenjnoineo`.

RPC URLs live in `config.example.json` and can be overridden in `config.json`. Public RPCs are rate limited. A failed read is shown as an error.

## Store submission

`CHROMEWEBSTORE.md` is the dashboard copy. `PRIVACY.md` matches the page to host at `https://spacexpad.xyz/agent-wallet/privacy` (`docs/agent-wallet/privacy.html`). Do not deploy that page from this repo, and do not replace `/`, `/skill`, `/skill.md`, or `/agents`.

The public landing page is `docs/agent-wallet/index.html`, with files only under `docs/agent-wallet/assets/`. Putting it on `https://spacexpad.xyz/agent-wallet/` is a path-isolated copy into the existing Pages output, described in `docs/agent-wallet/DEPLOY.md`. Do not deploy it from this repository, do not overwrite the live privacy page or `docs/agent-wallet/skill.md`, and do not add a catch-all redirect.

```bash
npm run pack:store
```

The zip is `store/spacexpad-agent-wallet-0.1.1.zip`. It is built from `dist` only, and `key` is removed from the zip's manifest. `public/manifest.json` keeps `key`, so the unpacked id stays `kgjgdglopjkfahcipgkpnnkenjnoineo`. The published listing is `nkbahofelgkjbagiabpcddnjjckbajep`. Confirm `chrome-extension://nkbahofelgkjbagiabpcddnjjckbajep/` and `https://nkbahofelgkjbagiabpcddnjjckbajep.chromiumapp.org/` on Privy app `cmwqh29x000hj0glajlwjht0s` before release, or Google login fails.
