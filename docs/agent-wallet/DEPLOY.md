# Deploy the Agent Wallet landing page

This file is the plan. Nothing in this repository deploys the site, and this change is not deployed.

## Where the page has to go

`https://spacexpad.xyz/` is Cloudflare Pages, project name `spacexpad`, in front of the zone for `spacexpad.xyz`.

Checked 23 November 2026:

- `/`, `/about`, `/agents`, `/skill`, and `/favicon.ico` are the launchpad. `/` and `/skill` use a long shared cache and `x-robots-tag: noindex`. `/about` and `/agents` use `cache-control: public, max-age=0, must-revalidate`, which is what Pages serves for HTML.
- `https://spacexpad.xyz/agent-wallet/` and `/agent-wallet/index.html` are 404, `cache-control: no-store`.
- `https://spacexpad.xyz/agent-wallet/skill.md` matches `docs/agent-wallet/skill.md` byte for byte.
- `https://spacexpad.xyz/agent-wallet/privacy` is live. It is not the same bytes as `docs/agent-wallet/privacy.html`. The repo copy mentions optional RPC endpoints. The live page does not. Store version 0.1.0 does not have custom RPC. Do not overwrite the live privacy file with the repo copy.
- `/agent-wallet/privacy.html` is 404. Pages serves `privacy.html` at `/agent-wallet/privacy`. A new `index.html` is what serves `/agent-wallet/`.

The public repository `spacexpad/spacexpad` is the devnet program, SDK, and launchpad skill. It has no site and `has_pages` is false.

The site source is the private repository `timmy2048/spacexpad`:

- Truth for the launchpad: `frontend/` (`spacexpad.html`, `agents.html`, `functions/`, `_redirects`).
- Deploy staging: `pages-deploy/`, gitignored. `docs/deploy.md` in that repo is the current procedure. Run `wrangler pages deploy .` from inside `pages-deploy`. Deploying the directory from its parent drops the Functions bundle and breaks `/api/*`.
- `frontend/` has no `agent-wallet/` directory. The live skill and privacy files were copied into `pages-deploy/agent-wallet/` outside git. Rebuilding `pages-deploy/` from `frontend/` alone would delete them.

`_redirects` only sends `www` to the apex. There is no catch-all. Do not add one. Unknown paths must keep returning 404, including `/skill.md`.

This extension repository does not host the zone. `worker/` is the authorization service, not the website. Do not deploy it for this page.

## Copy, and only this copy

On the machine that already has the production `pages-deploy/` tree (the one that currently contains `agent-wallet/skill.md` and `agent-wallet/privacy.html`):

```bash
cp docs/agent-wallet/index.html pages-deploy/agent-wallet/index.html
mkdir -p pages-deploy/agent-wallet/assets
cp -R docs/agent-wallet/assets/. pages-deploy/agent-wallet/assets/
```

Paths are relative to each repository root. Do not copy `DESIGN.md`, `DEPLOY.md`, or `landing.test.mjs`.

Leave these untouched:

- `pages-deploy/index.html`, `spacexpad.html`, `agents.html`, `about.html`, and the rest of the launchpad
- `pages-deploy/skill`, `skill.md` at the site root, and `functions/`
- `pages-deploy/_redirects` and any existing `_headers`
- `pages-deploy/agent-wallet/skill.md`
- `pages-deploy/agent-wallet/privacy.html`

Assets land at `/agent-wallet/assets/`, not `/assets/`. The launchpad already uses `/assets/` for its token image.

## Deploy

From inside `pages-deploy`, the same command that repo already documents:

```bash
wrangler pages deploy .
```

The log has to include `Uploading Functions bundle`. Then check, without treating a wrangler upload count as proof:

- `https://spacexpad.xyz/` is still the launchpad
- `https://spacexpad.xyz/skill`, `/skill.md` (still 404), and `/agents` are unchanged
- `https://spacexpad.xyz/agent-wallet/` is this page, canonical `https://spacexpad.xyz/agent-wallet/`
- `https://spacexpad.xyz/agent-wallet/skill.md` and `/agent-wallet/privacy` still match the pre-deploy bodies
- `https://spacexpad.xyz/api/launches` still returns JSON
- The Chrome button opens `https://chromewebstore.google.com/detail/spacexpad-agent-wallet/nkbahofelgkjbagiabpcddnjjckbajep`

## Access

Someone who already deploys that Pages project. Wrangler on that machine is already logged in, or `CLOUDFLARE_API_TOKEN` is set in the environment for the command. Do not write the token into a file, a command line someone will copy, or this repository. This change does not have that credential and does not deploy.

Account and zone identifiers stay in the private repo’s `docs/deploy.md`. They are not repeated here.
