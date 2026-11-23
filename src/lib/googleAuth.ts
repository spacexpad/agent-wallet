export const OAUTH_CALLBACK_KEY = 'spacexpad-google-oauth-callback';

export type KeyValueStore = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

export type AuthContext = {
  documentUrl?: string;
  windowId?: number;
};

export type AuthWindowPlan = { action: 'focus'; windowId: number } | { action: 'open' };

export type AuthWindowLock = { current: Promise<void> | null };

export function browserSession(): KeyValueStore | null {
  try {
    if (typeof sessionStorage === 'undefined') return null;
    return sessionStorage;
  } catch {
    return null;
  }
}

export function extensionDocumentUrl(url: string): string {
  const withoutHash = url.split('#')[0] ?? url;
  return withoutHash.split('?')[0] ?? withoutHash;
}

export function oauthCallbackFromSearch(search: string): boolean {
  const query = search.startsWith('?') ? search.slice(1) : search;
  const params = new URLSearchParams(query);
  return Boolean(params.get('privy_oauth_code') && params.get('privy_oauth_state') && params.get('privy_oauth_provider'));
}

export function rememberOAuthCallback(search: string, storage: KeyValueStore | null): boolean {
  if (oauthCallbackFromSearch(search)) {
    try {
      storage?.setItem(OAUTH_CALLBACK_KEY, '1');
    } catch {
      // The in-memory flag still blocks a second OAuth start on this load.
    }
    return true;
  }
  try {
    return storage?.getItem(OAUTH_CALLBACK_KEY) === '1';
  } catch {
    return false;
  }
}

export function clearOAuthCallback(storage: KeyValueStore | null): void {
  try {
    storage?.removeItem(OAUTH_CALLBACK_KEY);
  } catch {
    // A leftover flag only suppresses a repeat start in this auth window.
  }
}

export function shouldStartGoogleOAuth(input: {
  ready: boolean;
  authenticated: boolean;
  callbackPending: boolean;
  alreadyStarted: boolean;
}): boolean {
  if (!input.ready || input.authenticated) return false;
  if (input.callbackPending || input.alreadyStarted) return false;
  return true;
}

export function oauthFlowError(
  state: { status: string; error?: { message?: string } | null } | null | undefined,
  fallback: string,
): string | null {
  if (!state || state.status !== 'error') return null;
  const message = state.error?.message?.trim();
  return message ? message : fallback;
}

export function planAuthWindow(contexts: readonly AuthContext[], authUrl: string): AuthWindowPlan {
  const windowId = findAuthWindowId(contexts, authUrl);
  if (windowId == null) return { action: 'open' };
  return { action: 'focus', windowId };
}

export function findAuthWindowId(contexts: readonly AuthContext[], authUrl: string): number | null {
  const target = extensionDocumentUrl(authUrl);
  for (const context of contexts) {
    if (context.windowId == null || context.windowId < 0 || !context.documentUrl) continue;
    if (extensionDocumentUrl(context.documentUrl) === target) return context.windowId;
  }
  return null;
}

export async function openGoogleAuthWindow(
  lock: AuthWindowLock,
  deps: {
    authUrl: string;
    contexts: () => Promise<readonly AuthContext[]>;
    focus: (windowId: number) => Promise<void>;
    open: () => Promise<void>;
  },
): Promise<void> {
  if (lock.current) return lock.current;
  const run = openOnce(deps);
  lock.current = run;
  try {
    await run;
  } finally {
    if (lock.current === run) lock.current = null;
  }
}

async function openOnce(deps: {
  authUrl: string;
  contexts: () => Promise<readonly AuthContext[]>;
  focus: (windowId: number) => Promise<void>;
  open: () => Promise<void>;
}): Promise<void> {
  const plan = planAuthWindow(await deps.contexts(), deps.authUrl);
  if (plan.action === 'focus') {
    try {
      await deps.focus(plan.windowId);
      return;
    } catch {
      await deps.open();
      return;
    }
  }
  await deps.open();
}

export async function handoffGoogleSession(deps: {
  notify: () => Promise<void>;
  openPopup: () => Promise<void>;
  close: () => void;
}): Promise<'popup' | 'stay'> {
  await deps.notify();
  try {
    await deps.openPopup();
  } catch {
    return 'stay';
  }
  deps.close();
  return 'popup';
}
