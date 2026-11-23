# Agent Wallet landing page

Scoped to `docs/agent-wallet/index.html` and `docs/agent-wallet/assets/`. The popup treatment in the repository root `DESIGN.md` and `src/popup/styles.css` stays as it is. This page does not restyle the launchpad.

## References

- Orbital popup: `src/popup/styles.css` and the root `DESIGN.md`. Paper `#121524`, panel `#1b2038`, panel-dark `#14182b`, rule `#38436e`, accent `#38bdf8`, ink `#f1f5f9`, mute `#94a3b8`. Sora for the UI, IBM Plex Mono for identifiers. No site grid, no glow, no pixel type. The toolbar mark is the real file `public/icons/icon-128.png`, copied to `assets/mark.png`. It is not a redraw.
- Published listing, checked 23 November 2026: `https://chromewebstore.google.com/detail/nkbahofelgkjbagiabpcddnjjckbajep` redirects to `https://chromewebstore.google.com/detail/spacexpad-agent-wallet/nkbahofelgkjbagiabpcddnjjckbajep`. The page is “SpaceXpad agent wallet”, version 0.1.0, id `nkbahofelgkjbagiabpcddnjjckbajep`. Copy follows that listing. Custom RPC endpoints exist on main (pull request 7) and are not in this store build, so the page says they are not included.
- Setup, linked and not edited: `docs/agent-wallet/skill.md`. Control names come from `src/ui/LoginScreen.tsx`, `src/ui/BindScreen.tsx`, `src/ui/SettingsPanel.tsx`, `src/ui/OfflineGrant.tsx`, and the Agent tab in `src/popup/App.tsx`: Send code, Confirm code, Continue with Google, Bind an agent, Copy prompt, Binding token, Bind, Full access, Pause all agents, Resume, Turn off offline signing, Remove.
- [Vercel Web Interface Guidelines](https://vercel.com/design/guidelines): one `h1`, skip link, `:focus-visible`, 44px targets, `touch-action: manipulation`, links are `<a>`, no `transition: all`, `prefers-reduced-motion`, `scroll-margin-top` under the sticky header, safe-area padding, `theme-color`, `color-scheme: dark`, image width and height, font preload, canonical URL `https://spacexpad.xyz/agent-wallet/`.
- Launchpad homepage `https://spacexpad.xyz/`: same navy and cyan family, and the same mark, set in Press Start 2P, Silkscreen, and VT323 on a pixel grid. Those styles stay on the launchpad. This page does not import `spacexpad.css`.

## Type

Two families, both already used by the popup, subset to Latin and self-hosted as woff2:

- Sora (SIL OFL) at 400 and 600, for the page.
- IBM Plex Mono (SIL OFL) at 400 and 500, for the extension id, step numbers, and control names.

`简体中文` and `繁體中文` fall back to the system font. Licenses are beside the files in `assets/fonts/`.

## Color roles

The hex values are the Orbital tokens, not a new palette. Roles follow the Radix pattern (background, surface, border, foreground, muted, accent, accent foreground). Contrast against `#121524` is WCAG AA or better: foreground 16.5:1, muted `#94a3b8` 7.1:1, link `#7dd3fc` 10.9:1, accent button text `#082033` on `#38bdf8` 7.8:1. Hover raises the button to `#7dd3fc` and links to `#e0f2fe`. Status is never color alone. The risk copy names the control.

## Motion

Only `background-color` and `color`, 160ms, `cubic-bezier(0.2, 0, 0, 1)`, matching the popup ease. `prefers-reduced-motion: reduce` removes that transition. No transform, no glow, no autoplay.

## What this page refuses

No adoption counts, quotes, certifications, sample balances, or composed product screenshots. The only picture is the toolbar icon. No seed-export steps. The launchpad is named as Solana devnet, not as a mainnet product.
