import '../buffer-polyfill.ts';
import '../fonts.ts';
import { useState, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { PrivyProvider } from '@privy-io/react-auth';
import { nativeAsset } from '../../shared/assets.ts';
import { t } from '../../shared/i18n.ts';
import { defaultStore } from '../../shared/store.ts';
import type { Lang, Snapshot, Store } from '../../shared/types.ts';
import { AssetHome } from '../ui/AssetHome.tsx';
import { brandIcon } from '../ui/brand.ts';
import { BindScreen } from '../ui/BindScreen.tsx';
import { LoginScreen } from '../ui/LoginScreen.tsx';
import { OfflineGrant } from '../ui/OfflineGrant.tsx';
import { SettingsPanel } from '../ui/SettingsPanel.tsx';
import '../popup/styles.css';
import './store-frame.css';

document.documentElement.classList.add('preview');

const params = new URLSearchParams(location.search);
const framed = params.get('frame') === 'store';
if (framed) document.documentElement.classList.add('store-shot');
const state = params.get('state') ?? 'login';
const lang = (params.get('lang') ?? 'zh-CN') as Lang;
const settingsPage = params.get('page') === 'risk' ? 'risk' : params.get('page') === 'rpc' ? 'rpc' : 'home';

const solana = 'So1aNaDemo11111111111111111111111111111111';
const evm = '0xDeaD00000000000000000000000000000000b0b0';

function snap(chain: Snapshot['chain'], amount: bigint, extra: Snapshot['assets'] = []): Snapshot {
  return {
    chain,
    network: 'mainnet',
    status: 'ready',
    error: null,
    tokenListError: null,
    assets: [nativeAsset(chain, amount), ...extra],
    readAt: 1,
  };
}

const usdc = {
  symbol: 'USDC',
  name: 'USD Coin',
  amount: '80',
  raw: '80000000',
  decimals: 6,
  contract: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  native: false,
  usd: null,
};

const ready: Snapshot[] = [
  snap('solana', 2_500_000_000n, [usdc]),
  snap('ethereum', 0n),
  snap('base', 0n, [
    {
      symbol: 'USDC',
      name: 'USD Coin',
      amount: '12.5',
      raw: '12500000',
      decimals: 6,
      contract: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
      native: false,
      usd: null,
    },
  ]),
  snap('bnb', 0n),
];

const errored: Snapshot[] = [
  snap('solana', 0n),
  {
    chain: 'ethereum',
    network: 'mainnet',
    status: 'error',
    error: 'eth_getBalance failed (429).',
    tokenListError: null,
    assets: [],
    readAt: 1,
  },
  snap('base', 0n),
  snap('bnb', 0n),
];

const labels: Record<string, string> = {
  login: 'Fixture: signed-out login.',
  wallet: 'Fixture: Solana home. Sample amounts, not a live wallet.',
  picker: 'Fixture: network picker open. Solana and EVM only.',
  evm: 'Fixture: EVM home. Ethereum, Base, and BNB share one address.',
  error: 'Fixture: Ethereum read failed. That row is an error, not a zero balance.',
  loading: 'Fixture: balances still loading. Amounts are hidden.',
  bind: 'Fixture: first-run bind gate. Assets are not reachable.',
  settings: 'Fixture: settings home or the risk subpage. No bridge token field.',
  agent: 'Fixture: Agent tab. Offline signing for a fictional bound agent. No pair code.',
  approval: 'Fixture: test-network send waiting for confirmation.',
};

const label = document.getElementById('label');
if (label) label.textContent = labels[state] ?? `Fixture: ${state}`;

function demoStore(): Store {
  return {
    ...defaultStore(),
    language: lang,
    username: 'nova',
    offlineSigning: null,
    agents: [{ id: 'nova', name: 'Nova', token: '', boundAt: 1, offlineGranted: true }],
  };
}

function Preview() {
  const [tab, setTab] = useState<'wallet' | 'agent' | 'settings'>(
    state === 'settings' ? 'settings' : state === 'agent' ? 'agent' : 'wallet',
  );
  const screen = screenFor(tab);
  if (!framed) return screen;
  return (
    <div className="store-stage">
      <div className="store-copy">
        <img src={brandIcon(128)} alt="" />
        <p className="store-kicker">SpaceXpad</p>
        <h2>Agent Wallet</h2>
        <p>{frameCaption(state, settingsPage)}</p>
      </div>
      <div className="store-popup">{screen}</div>
    </div>
  );

  function screenFor(current: 'wallet' | 'agent' | 'settings') {
    if (state === 'login') {
      return (
        <LoginScreen
          lang={lang}
          email=""
          code=""
          phase="idle"
          notice={null}
          error={null}
          onEmail={() => undefined}
          onCode={() => undefined}
          onSend={() => undefined}
          onConfirm={() => undefined}
          onGoogle={() => undefined}
        />
      );
    }
    if (state === 'bind') {
      return (
        <main className="shell">
          <header className="top">
            <img src={brandIcon(32)} alt="" />
            <h1 className="brand">{t(lang, 'mark')}</h1>
          </header>
          <div className="body">
            <BindScreen
              lang={lang}
              token=""
              copied={false}
              error={null}
              onToken={() => undefined}
              onCopy={() => undefined}
              onBind={() => undefined}
              onLanguage={() => undefined}
              onLogout={() => undefined}
            />
          </div>
        </main>
      );
    }
    const snapshots = state === 'loading' ? [] : state === 'error' ? errored : ready;
    let body: ReactNode = null;
    if (state === 'agent' || current === 'agent') body = <AgentPreview />;
    else if (state === 'settings' || current === 'settings') body = <SettingsPreview page={state === 'settings' ? settingsPage : 'home'} />;
    else {
      body = (
        <AssetHome
          lang={lang}
          solana={state === 'loading' ? null : solana}
          evm={state === 'loading' ? null : evm}
          snapshots={snapshots}
          pending={state === 'loading'}
          walletsReady={state !== 'loading'}
          onRefresh={() => undefined}
          initialHome={state === 'evm' || state === 'error' ? 'evm' : 'solana'}
          forceOpen={state === 'picker'}
        />
      );
    }
    return (
      <main className="shell">
        <header className="account-head">
          <div className="top">
            <img src={brandIcon(32)} alt="" />
            <h1 className="brand">{t(lang, 'mark')}</h1>
          </div>
          <p className="account-name">@nova</p>
        </header>
        {state === 'approval' ? (
          <div className="banner">
            <p>Claude asked to send on Base Sepolia. This is a test network. Nothing is signed until you confirm.</p>
            <div className="actions">
              <button type="button" className="quiet-button">
                {t(lang, 'rejectTestnet')}
              </button>
              <button type="button" className="quiet-button">
                {t(lang, 'confirmTestnet')}
              </button>
            </div>
          </div>
        ) : null}
        <div className="body">{body}</div>
        <nav className="dock" aria-label={t(lang, 'primaryNav')}>
          <div className="dock-pill">
            {(['wallet', 'agent', 'settings'] as const).map((id) => (
              <button key={id} type="button" aria-current={current === id ? 'page' : undefined} onClick={() => setTab(id)}>
                {t(lang, id === 'wallet' ? 'navWallet' : id === 'agent' ? 'navAgent' : 'navSettings')}
              </button>
            ))}
          </div>
        </nav>
      </main>
    );
  }
}

function frameCaption(which: string, page: 'home' | 'risk' | 'rpc'): string {
  if (which === 'login') return 'Sign in with email or Google. Privy holds the keys. There is no seed phrase.';
  if (which === 'settings' && page === 'risk') return 'Risk policy. Full access is the default. Pause all agents is the kill switch.';
  if (which === 'settings') return 'Settings home. Language, risk policy, and the other rows open their own pages.';
  if (which === 'agent') return 'Agent tab. Offline signing is on for this bound agent until you turn it off.';
  return 'Mainnet balances for a demo wallet. Open the list to copy a public address.';
}

function SettingsPreview({ page }: { page: 'home' | 'risk' | 'rpc' }) {
  const store = demoStore();
  return <SettingsPanel store={store} logout={() => undefined} initialPage={page} />;
}

function AgentPreview() {
  const store = demoStore();
  const agent = store.agents[0];
  return (
    <PrivyProvider
      appId="cmwqh29x000hj0glajlwjht0s"
      config={{
        loginMethods: ['email', 'google'],
        appearance: { theme: 'dark', accentColor: '#38bdf8' },
        embeddedWallets: {
          showWalletUIs: false,
          ethereum: { createOnLogin: 'off' },
          solana: { createOnLogin: 'off' },
        },
      }}
    >
      <section className="panel" aria-labelledby="agent-title">
        <h2 id="agent-title">{t(lang, 'agents')}</h2>
        <div className="row">
          <span>{agent.name}</span>
          <OfflineGrant store={store} token={agent.token} />
          <button type="button" className="quiet-button">
            {t(lang, 'unbind')}
          </button>
        </div>
        <h2>{t(lang, 'bindTitle')}</h2>
        <p className="note">{t(lang, 'bindIntro')}</p>
        <button type="button" className="primary">
          {t(lang, 'copyPrompt')}
        </button>
        <label className="field" htmlFor="rebind-token">
          <span>{t(lang, 'tokenLabel')}</span>
          <input id="rebind-token" value="" readOnly autoComplete="off" spellCheck={false} />
        </label>
        <button type="button" className="primary">
          {t(lang, 'bindAction')}
        </button>
      </section>
    </PrivyProvider>
  );
}

createRoot(document.getElementById('root') as HTMLElement).render(<Preview />);
