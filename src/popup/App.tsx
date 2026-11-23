import { useEffect, useRef, useState } from 'react';
import { BIND_TOKEN_PATTERN, PAIR_TTL_MS, buildInstallNote, createPairCode } from '../../shared/prompt.ts';
import { bindAwaitingGrant, hasAppId, walletReady } from '../../shared/store.ts';
import { messageSignCopy, t, testnetConfirmCopy } from '../../shared/i18n.ts';
import type { Lang, Store } from '../../shared/types.ts';
import { redeemBindToken, registerPendingPair } from '../lib/bindFlow.ts';
import { copyText } from '../lib/copyText.ts';
import {
  browserSession,
  clearOAuthCallback,
  handoffGoogleSession,
  oauthFlowError,
  openGoogleAuthWindow,
  rememberOAuthCallback,
  shouldStartGoogleOAuth,
  type AuthWindowLock,
} from '../lib/googleAuth.ts';
import { authPost, ensureOwnerKey } from '../lib/offlineClient.ts';
import { completeEmailLogin, endVaultSession, notifyAuthChanged } from '../lib/sessionSync.ts';
import { bridgePost, ensureBridgeToken, registerStoredPair, updateStore } from '../lib/storage.ts';
import { PrivyGate, useVault } from '../privy/useVault.tsx';
import { AssetHome } from '../ui/AssetHome.tsx';
import { brandIcon } from '../ui/brand.ts';
import { Banner, BindScreen, CopyFallback } from '../ui/BindScreen.tsx';
import { LoginScreen, type OtpPhase } from '../ui/LoginScreen.tsx';
import { AutoGrant, OfflineGrant } from '../ui/OfflineGrant.tsx';
import { SettingsPanel } from '../ui/SettingsPanel.tsx';
import { useExtensionStore } from './useStore.ts';
import { useMainnetBalances } from './useMainnet.ts';

const authWindowLock: AuthWindowLock = { current: null };

type Tab = 'wallet' | 'agent' | 'settings';

export function App({ surface }: { surface: 'popup' | 'auth' }) {
  const store = useExtensionStore();
  useEffect(() => {
    if (!store) return;
    document.documentElement.lang = store.language;
  }, [store]);
  if (!store) {
    return (
      <main className="shell">
        <p className="note pad">…</p>
      </main>
    );
  }
  if (!hasAppId(store.settings)) return <Setup store={store} />;
  return (
    <PrivyGate appId={store.settings.privyAppId} clientId={store.settings.privyClientId}>
      <Session surface={surface} store={store} />
    </PrivyGate>
  );
}

function Setup({ store }: { store: Store }) {
  const [appId, setAppId] = useState(store.settings.privyAppId);
  const [clientId, setClientId] = useState(store.settings.privyClientId);
  const extensionId = chrome.runtime.id;
  const redirect = `https://${extensionId}.chromiumapp.org/`;
  return (
    <main className="shell">
      <header className="top">
        <img src={brandIcon(32)} alt="" />
        <h1 className="brand">{t(store.language, 'mark')}</h1>
      </header>
      <div className="body">
        <h2>{t(store.language, 'setupTitle')}</h2>
        <p className="note">{t(store.language, 'setupBody')}</p>
        <p className="note">
          {t(store.language, 'extensionId')} {extensionId}
        </p>
        <p className="note">
          {t(store.language, 'redirectUrl')} {redirect}
        </p>
        <label className="field" htmlFor="setup-app">
          <span>{t(store.language, 'privyAppId')}</span>
          <input id="setup-app" value={appId} onChange={(event) => setAppId(event.target.value)} autoComplete="off" />
        </label>
        <label className="field" htmlFor="setup-client">
          <span>
            {t(store.language, 'privyClientId')} ({t(store.language, 'optional')})
          </span>
          <input id="setup-client" value={clientId} onChange={(event) => setClientId(event.target.value)} autoComplete="off" />
        </label>
        <button
          type="button"
          className="primary"
          onClick={() => {
            void updateStore((current) => ({
              ...current,
              settings: {
                ...current.settings,
                privyAppId: appId.trim(),
                privyClientId: clientId.trim(),
                hydrated: true,
              },
            }));
          }}
        >
          {t(store.language, 'save')}
        </button>
        {store.settings.configError ? <p className="error">{store.settings.configError}</p> : null}
      </div>
    </main>
  );
}

function Session({ surface, store }: { surface: 'popup' | 'auth'; store: Store }) {
  const vault = useVault();
  const started = useRef(false);
  const handedOff = useRef(false);
  const alive = useRef(true);
  const [callbackPending, setCallbackPending] = useState(() =>
    surface === 'auth' ? rememberOAuthCallback(window.location.search, browserSession()) : false,
  );
  const [googleError, setGoogleError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [grantError, setGrantError] = useState<string | null>(null);
  const [grantAttempt, setGrantAttempt] = useState(0);
  const lang = store.language;

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  useEffect(() => {
    if (surface !== 'auth') return;
    if (
      !shouldStartGoogleOAuth({
        ready: vault.ready,
        authenticated: vault.authenticated,
        callbackPending,
        alreadyStarted: started.current,
      })
    ) {
      return;
    }
    started.current = true;
    setGoogleError(null);
    void vault.googleLogin.initOAuth({ provider: 'google' }).catch((reason: unknown) => {
      if (!alive.current) return;
      const message = reason instanceof Error && reason.message.trim() ? reason.message : t(lang, 'googleSignInFailed');
      setGoogleError(message);
    });
  }, [attempt, callbackPending, lang, surface, vault.authenticated, vault.googleLogin, vault.ready]);

  useEffect(() => {
    if (surface !== 'auth' || !vault.authenticated || handedOff.current) return;
    handedOff.current = true;
    clearOAuthCallback(browserSession());
    setCallbackPending(false);
    void handoffGoogleSession({
      notify: notifyAuthChanged,
      openPopup: async () => {
        await chrome.action.openPopup();
      },
      close: () => window.close(),
    });
  }, [surface, vault.authenticated]);

  const retryGoogle = () => {
    started.current = false;
    clearOAuthCallback(browserSession());
    setCallbackPending(false);
    setGoogleError(null);
    setAttempt((value) => value + 1);
  };
  const retryGrant = () => {
    setGrantError(null);
    setGrantAttempt((value) => value + 1);
  };

  if (!vault.ready) {
    return (
      <main className="shell">
        <p className="note pad">{surface === 'auth' ? t(lang, 'openingGoogle') : t(lang, 'working')}</p>
      </main>
    );
  }
  if (!vault.authenticated) {
    if (surface === 'auth') {
      const flowError = oauthFlowError(vault.googleLogin.state, t(lang, 'googleSignInFailed'));
      return <GoogleWait lang={lang} error={googleError ?? flowError} onRetry={retryGoogle} />;
    }
    return <Login lang={lang} vault={vault} />;
  }
  const logout = () => {
    void endVaultSession(() => vault.logout());
    if (surface === 'auth') window.close();
  };
  return (
    <>
      <AutoGrant store={store} attempt={grantAttempt} onError={setGrantError} />
      {walletReady(store) ? (
        <Console store={store} logout={logout} grantError={grantError} onRetryGrant={retryGrant} />
      ) : (
        <BindGate store={store} logout={logout} grantError={grantError} onRetryGrant={retryGrant} />
      )}
    </>
  );
}

function GoogleWait({ lang, error, onRetry }: { lang: Lang; error: string | null; onRetry: () => void }) {
  return (
    <main className="shell">
      <header className="top">
        <img src={brandIcon(32)} alt="" />
        <h1 className="brand">{t(lang, 'mark')}</h1>
      </header>
      <div className="body">
        {error ? (
          <p className="error" role="alert">
            {error}
          </p>
        ) : (
          <p className="note">{t(lang, 'openingGoogle')}</p>
        )}
        {error ? (
          <button type="button" className="primary" onClick={onRetry}>
            {t(lang, 'continueGmail')}
          </button>
        ) : null}
      </div>
    </main>
  );
}

function Login({ lang, vault }: { lang: Lang; vault: ReturnType<typeof useVault> }) {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [phase, setPhase] = useState<OtpPhase>('idle');
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  return (
    <LoginScreen
      lang={lang}
      email={email}
      code={code}
      phase={phase}
      notice={notice}
      error={error}
      onEmail={setEmail}
      onCode={setCode}
      onSend={() => {
        if (!email.includes('@')) return;
        setError(null);
        setNotice(null);
        void send(email.trim());
      }}
      onConfirm={() => {
        setError(null);
        void confirm(code.trim());
      }}
      onGoogle={() => void startGoogle()}
    />
  );

  async function send(value: string): Promise<void> {
    setPhase('sending');
    try {
      await vault.emailLogin.sendCode({ email: value });
      setPhase('sent');
      setNotice(t(lang, 'codeSent'));
    } catch (reason) {
      setPhase('idle');
      setNotice(null);
      setError(reason instanceof Error ? reason.message : t(lang, 'vaultError'));
    }
  }

  async function confirm(value: string): Promise<void> {
    setPhase('confirming');
    try {
      await completeEmailLogin(async (code) => {
        await vault.emailLogin.loginWithCode({ code });
      }, value);
    } catch (reason) {
      setPhase('sent');
      setError(reason instanceof Error ? reason.message : t(lang, 'vaultError'));
    }
  }
}

async function startGoogle(): Promise<void> {
  const authUrl = chrome.runtime.getURL('auth.html');
  await openGoogleAuthWindow(authWindowLock, {
    authUrl,
    contexts: async () => {
      const found = await chrome.runtime.getContexts({});
      return found.map((context) => ({ documentUrl: context.documentUrl, windowId: context.windowId }));
    },
    focus: async (windowId) => {
      await chrome.windows.update(windowId, { focused: true });
    },
    open: async () => {
      await chrome.windows.create({
        url: authUrl,
        type: 'popup',
        width: 420,
        height: 720,
        focused: true,
      });
    },
  });
}

function BindGate({
  store,
  logout,
  grantError,
  onRetryGrant,
}: {
  store: Store;
  logout: () => void;
  grantError: string | null;
  onRetryGrant: () => void;
}) {
  const pairing = usePairing(store);
  const waiting = bindAwaitingGrant(store) && !grantError && !pairing.error;
  return (
    <main className="shell">
      <BrandHeader lang={store.language} />
      <ApprovalBanner store={store} />
      <div className="body">
        {store.vaultError ? (
          <p className="error" role="alert">
            {store.vaultError}
          </p>
        ) : null}
        <BindScreen
          lang={store.language}
          token={pairing.token}
          copied={pairing.copied}
          error={pairing.error ?? grantError}
          notice={waiting ? t(store.language, 'grantingAuth') : pairing.notice}
          fallback={pairing.fallback}
          onToken={pairing.setToken}
          onCopy={() => void pairing.copyPrompt()}
          onBind={() => void pairing.bind()}
          onRetry={grantError && !pairing.error ? onRetryGrant : null}
          onLanguage={(language) => {
            void updateStore((current) => ({ ...current, language }));
          }}
          onLogout={logout}
        />
      </div>
    </main>
  );
}

function Console({
  store,
  logout,
  grantError,
  onRetryGrant,
}: {
  store: Store;
  logout: () => void;
  grantError: string | null;
  onRetryGrant: () => void;
}) {
  const lang = store.language;
  const [tab, setTab] = useState<Tab>('wallet');
  const balances = useMainnetBalances(store);
  const walletsReady = Boolean(store.addresses?.solana || store.addresses?.evm);

  return (
    <main className="shell">
      <AccountHeader lang={lang} username={store.username} />
      {store.policy.agentsPaused ? (
        <Banner>
          <p>{t(lang, 'paused')}</p>
          <button
            type="button"
            className="quiet-button"
            onClick={() => {
              void updateStore((current) => ({ ...current, policy: { ...current.policy, agentsPaused: false } }));
            }}
          >
            {t(lang, 'resume')}
          </button>
        </Banner>
      ) : null}
      <ApprovalBanner store={store} />
      <div className="body">
        {store.vaultError ? (
          <p className="error" role="alert">
            {store.vaultError}
          </p>
        ) : null}
        {grantError ? (
          <>
            <p className="error" role="alert">
              {grantError}
            </p>
            <button type="button" className="quiet-button" onClick={onRetryGrant}>
              {t(lang, 'retry')}
            </button>
          </>
        ) : null}
        {tab === 'wallet' ? (
          <AssetHome
            lang={lang}
            view={store.assetView}
            solana={store.addresses?.solana ?? null}
            evm={store.addresses?.evm ?? null}
            snapshots={store.snapshots}
            pending={balances.pending}
            walletsReady={walletsReady}
            onRefresh={walletsReady ? balances.refresh : null}
          />
        ) : null}
        {tab === 'agent' ? <AgentPanel store={store} /> : null}
        {tab === 'settings' ? <SettingsPanel store={store} logout={logout} /> : null}
      </div>
      <nav className="dock" aria-label={t(lang, 'primaryNav')}>
        <div className="dock-pill">
          <DockButton id="wallet" tab={tab} lang={lang} label="navWallet" onSelect={setTab} />
          <DockButton id="agent" tab={tab} lang={lang} label="navAgent" onSelect={setTab} />
          <DockButton id="settings" tab={tab} lang={lang} label="navSettings" onSelect={setTab} />
        </div>
      </nav>
    </main>
  );
}

function BrandHeader({ lang }: { lang: Lang }) {
  return (
    <header className="top">
      <img src={brandIcon(32)} alt="" />
      <h1 className="brand">{t(lang, 'mark')}</h1>
    </header>
  );
}

function AccountHeader({ lang, username }: { lang: Lang; username: string }) {
  return (
    <header className="account-head">
      <div className="top">
        <img src={brandIcon(32)} alt="" />
        <h1 className="brand">{t(lang, 'mark')}</h1>
      </div>
      <p className="account-name">@{username || 'wallet'}</p>
    </header>
  );
}

function ApprovalBanner({ store }: { store: Store }) {
  const pending = store.pendingApproval;
  if (!pending) return null;
  const text =
    pending.method === 'sign_message'
      ? messageSignCopy(store.language, pending.agentName, pending.chain, pending.network)
      : testnetConfirmCopy(store.language, pending.method, pending.agentName, pending.chain, pending.network);
  return (
    <Banner>
      <div>
        <p>{text}</p>
        {pending.message ? <pre className="message-preview">{pending.message}</pre> : null}
      </div>
      <div className="actions">
        <button type="button" className="quiet-button" onClick={() => void decide(store.pendingApproval?.id ?? '', false)}>
          {t(store.language, 'rejectTestnet')}
        </button>
        <button type="button" className="quiet-button" onClick={() => void decide(store.pendingApproval?.id ?? '', true)}>
          {t(store.language, 'confirmTestnet')}
        </button>
      </div>
    </Banner>
  );
}

function DockButton({
  id,
  tab,
  lang,
  label,
  onSelect,
}: {
  id: Tab;
  tab: Tab;
  lang: Lang;
  label: 'navWallet' | 'navAgent' | 'navSettings';
  onSelect: (tab: Tab) => void;
}) {
  return (
    <button type="button" aria-current={tab === id ? 'page' : undefined} onClick={() => onSelect(id)}>
      {t(lang, label)}
    </button>
  );
}

function usePairing(store: Store) {
  const lang = store.language;
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [token, setToken] = useState('');
  const [copied, setCopied] = useState(false);
  const [fallback, setFallback] = useState<string | null>(null);

  const copyPrompt = async () => {
    setError(null);
    const code = createPairCode();
    const expiresAt = Date.now() + PAIR_TTL_MS;
    await updateStore((current) => ({ ...current, pair: { code, expiresAt, registered: false } }));
    const settings = await ensureBridgeToken(store.settings);
    const outcome = await registerPendingPair(settings, { code, expiresAt }, {
      registerBridge: registerStoredPair,
      postAuth: authPost,
      ensureOwnerKey,
    });
    if (outcome.registered) {
      await updateStore((current) =>
        current.pair?.code === code ? { ...current, pair: { ...current.pair, registered: true } } : current,
      );
    }
    const note = buildInstallNote(code);
    const wrote = await copyText(note);
    setCopied(wrote);
    setFallback(wrote ? null : note);
    const problem = outcome.authError ?? outcome.bridgeError;
    if (problem) {
      setNotice(null);
      setError(problem);
      return;
    }
    setNotice(wrote ? t(lang, 'copyHint') : null);
  };

  const bind = async () => {
    const value = token.trim();
    if (!BIND_TOKEN_PATTERN.test(value)) {
      setError(t(lang, 'tokenRejected'));
      return;
    }
    if (!store.pair || store.pair.expiresAt < Date.now()) {
      setError(t(lang, 'pairExpired'));
      return;
    }
    const settings = await ensureBridgeToken(store.settings);
    try {
      const ownerKey = settings.authUrl ? await ensureOwnerKey() : '';
      const json = await redeemBindToken({
        authUrl: settings.authUrl,
        bridgeToken: settings.bridgeToken,
        pairCode: store.pair.code,
        bindToken: value,
        ownerKey,
        postAuth: (path, body) => authPost(settings, path, body),
        postBridge: (path, body) => bridgePost(settings, path, body),
      });
      await updateStore((current) => ({
        ...current,
        pair: null,
        agents: [
          ...current.agents,
          {
            id: String(json.agentId),
            name: String(json.agentName || 'Agent'),
            token: value,
            boundAt: Date.now(),
            offlineGranted: false,
          },
        ],
      }));
      setToken('');
      setError(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t(lang, 'tokenRejected'));
    }
  };

  return { error, notice, token, setToken, copied, fallback, copyPrompt, bind };
}

function AgentPanel({ store }: { store: Store }) {
  const lang = store.language;
  const pairing = usePairing(store);
  return (
    <section className="panel" aria-labelledby="agent-title">
      <h2 id="agent-title">{t(lang, 'agents')}</h2>
      {store.agents.map((agent) => (
        <div className="row" key={agent.id}>
          <span>{agent.name}</span>
          <OfflineGrant store={store} token={agent.token} />
          <button
            type="button"
            className="quiet-button"
            onClick={() => {
              void unbind(store, agent.token);
            }}
          >
            {t(lang, 'unbind')}
          </button>
        </div>
      ))}
      <h2>{t(lang, 'bindTitle')}</h2>
      <p className="note">{t(lang, 'bindIntro')}</p>
      <button type="button" className="primary" onClick={() => void pairing.copyPrompt()}>
        {pairing.copied ? t(lang, 'promptCopied') : t(lang, 'copyPrompt')}
      </button>
      {pairing.notice ? <p className="note">{pairing.notice}</p> : null}
      {pairing.fallback ? (
        <>
          <p className="error" role="alert">
            {t(lang, 'couldNotCopy')}
          </p>
          <CopyFallback lang={lang} text={pairing.fallback} />
        </>
      ) : null}
      <label className="field" htmlFor="rebind-token">
        <span>{t(lang, 'tokenLabel')}</span>
        <input
          id="rebind-token"
          value={pairing.token}
          onChange={(event) => pairing.setToken(event.target.value)}
          autoComplete="off"
          spellCheck={false}
        />
      </label>
      <button type="button" className="primary" onClick={() => void pairing.bind()}>
        {t(lang, 'bindAction')}
      </button>
      {pairing.error ? (
        <p className="error" role="alert">
          {pairing.error}
        </p>
      ) : null}
    </section>
  );
}

async function decide(id: string, allow: boolean): Promise<void> {
  if (!id) return;
  await updateStore((current) => ({ ...current, approval: { id, allow } }));
}

async function unbind(store: Store, token: string): Promise<void> {
  try {
    await bridgePost(store.settings, '/v1/pair/unbind', { bindToken: token });
  } catch {
    // Local removal still stops this extension from signing.
  }
  if (store.settings.authUrl && store.settings.ownerKey) {
    try {
      await authPost(store.settings, '/v1/revoke', { ownerKey: store.settings.ownerKey, bindToken: token });
    } catch {
      // The local binding is still removed. Retry the authorization service from the extension while it is open.
    }
  }
  await updateStore((current) => ({ ...current, agents: current.agents.filter((agent) => agent.token !== token) }));
}
