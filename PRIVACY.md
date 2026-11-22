# Privacy policy

**Operator:** SpaceXpad  
**Contact:** [hello@spacexpad.xyz](mailto:hello@spacexpad.xyz)  
**Last updated:** 22 November 2026

This policy describes the SpaceXpad Agent Wallet Chrome extension. It is not legal advice.

SpaceXpad Agent Wallet lets you sign in, see addresses and balances for Solana, Ethereum, Base, and BNB Chain, and let a paired agent request balances, signatures, and sends under a risk policy you control. The popup shows mainnet balances by default. Agent tools use mainnet unless the request explicitly names devnet or testnet. The SpaceXpad website is a separate product and is still on Solana devnet.

## Who holds the keys

Privy creates the embedded wallets and holds the key shares. The extension does not ask for a seed phrase, does not display one, and does not write an exported private key to `chrome.storage`. Signing inside Chrome goes through the Privy SDK. Signing while the extension is closed goes through Privy's wallet API, called by the authorization service below. That service does not receive an exported private key or the seed. Its Privy App Secret and authorization private key stay in the service's own secret store. They are not in the extension.

## Data stored on this device

The extension stores the following in `chrome.storage.local` on your computer:

- The public Privy App ID, and an optional Privy client ID if you add one
- The authorization service URL and the public key quorum id
- A local owner key that lets this browser update the authorization service. It is not a wallet private key
- The loopback bridge token, which the extension reads from the local MCP server. You are not asked to paste it into Settings
- Your email address and Privy user id after you sign in
- Display name, language, and risk-policy settings
- Optional RPC endpoints you enter in Settings. An empty field is not stored. A URL you enter stays in extension local storage and is not sent to SpaceXpad. It may include a query string from your provider
- Bound agent names and binding tokens
- A PAIR_CODE while a pairing is in progress. It expires in 30 minutes
- Wallet addresses after login
- Recent agent activity and, when a USD limit applies, how much has been sent today
- Cached balances. The popup reads mainnet after login. A testnet or devnet snapshot is stored only after an explicit request

The Privy SDK also stores its session in extension local storage. That data stays in this browser profile until you remove the extension, log out, or clear extension storage.

## Data sent off the device

When you use the extension, it contacts:

- **Privy** (`auth.privy.io`, `api.privy.io`, other `privy.io` hosts the SDK uses, and `rpc.privy.systems`) to sign you in with email or Google, to create the embedded wallets, and to sign. Your email address, or your Google account if you choose Google, is handled by Privy. Privy's own privacy policy applies to that account.
- **Public RPC providers** to read balances and submit transactions. Defaults are PublicNode for Solana mainnet, Ethereum, Base, and BNB Chain, and `api.devnet.solana.com` for Solana devnet. A testnet or devnet host is used only when the request names that cluster. If you save an RPC endpoint for a cluster, balance reads and broadcasts for that cluster go to that host instead. These calls send the public address and, when you broadcast, the signed transaction.
- **Blockscout** (`eth.blockscout.com`, `base.blockscout.com`, and the Sepolia hosts for those chains) to list fungible tokens for the public EVM address.
- **Jupiter** (`lite-api.jup.ag`) with the Solana address, only when the Solana token-account read is blocked and the extension falls back to Jupiter's public holdings API.
- **Binplorer** (`api.binplorer.com`) with the BNB Chain address to list fungible tokens. The request includes Binplorer's published `apiKey=freekey` parameter. That value is not a SpaceXpad secret. BNB Chain testnet token lists are not requested.
- **DefiLlama** (`coins.llama.fi`) to price an asset when a USD value can be shown or a limit needs a price. The request sends a public price id or token contract, not your wallet address.
- **The authorization service** at `https://spacexpad-agent-wallet-auth.timmy2048.workers.dev` for pairing, binding, the offline grant, policy updates, revoke, and sign or send when the extension is closed. That call can include the PAIR_CODE, binding token, local owner key, Privy user id, public addresses, Privy wallet ids, the risk policy, and the message or transaction to sign or send. It does not include an exported private key or the seed.
- **The local agent bridge** at `127.0.0.1` only, so an MCP server on that computer can request balances, signatures, and sends. Install the MCP server on the agent's own device first. Use your computer only when that agent has no device of its own.

The extension does not include analytics or advertising, and it does not run a SpaceXpad account server. `clipboardWrite` writes a public address or the install prompt when you click copy. The extension does not read the clipboard. It does not use `tabs`, `history`, or content scripts, and it does not read your browsing.

## Agents and offline signing

You copy a short install prompt and a PAIR_CODE from the extension. The code expires in 30 minutes. You paste the binding token the agent returns into the bind screen. You are not asked to paste a bridge token into Settings.

Offline signing is on by default after you sign in and an agent is bound. The extension grants it without a separate opt-in. A bound agent then signs and sends with no confirmation popup, including while Chrome is closed. You can turn offline signing off. An unbound request, a revoked binding, or a request while the kill switch is on is rejected and nothing is signed.

The default policy is full access. An empty whitelist does not block. A whitelist or a USD limit applies only after you turn it on. The kill switch pauses every agent, including requests that reach the authorization service while Chrome is closed.

## Google and email sign-in

Google login is Privy's Google OAuth. The extension opens it in a separate window because Chrome does not complete that redirect inside the toolbar popup. Email login uses a one-time code. There is no separate SpaceXpad password.

## Children

The extension is not directed at children.

## Retention and deletion

Local data remains until you log out, remove the extension, or clear its storage. Remove an agent in the extension to revoke it. Revoke and pause take effect on the authorization service, including for requests made while Chrome is closed. To ask about data held for this extension, email [hello@spacexpad.xyz](mailto:hello@spacexpad.xyz). Data Privy holds is subject to Privy's own deletion process.

## Changes

SpaceXpad will update this policy and the date above when these practices change.
