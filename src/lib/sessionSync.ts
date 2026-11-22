export const AUTH_CHANGED = 'AUTH_CHANGED';
export const OFFSCREEN_RESYNC_KEY = 'spacexpad-offscreen-auth-resync';
export const OFFSCREEN_RESYNC_GRACE_MS = 2_500;

export function isAuthChangedMessage(message: { type?: string } | null | undefined): boolean {
  return message?.type === AUTH_CHANGED;
}

export async function notifyAuthChanged(
  send: (message: { type: typeof AUTH_CHANGED }) => Promise<unknown> = (message) => chrome.runtime.sendMessage(message),
): Promise<void> {
  try {
    await send({ type: AUTH_CHANGED });
  } catch {
    // The offscreen document may not be listening yet. A later reload still reads the session.
  }
}

export async function completeEmailLogin(
  loginWithCode: (code: string) => Promise<void>,
  code: string,
  notify: () => Promise<void> = notifyAuthChanged,
): Promise<void> {
  await loginWithCode(code);
  await notify();
}

export async function endVaultSession(
  logout: () => Promise<void> | void,
  notify: () => Promise<void> = notifyAuthChanged,
): Promise<void> {
  await logout();
  await notify();
}

export function shouldResyncOffscreen(input: {
  storedSolana: string | null | undefined;
  storedUserId: string | null | undefined;
  privyReady: boolean;
  solanaWalletCount: number;
  alreadyResyncedUserId: string | null;
}): boolean {
  if (!input.privyReady) return false;
  if (!input.storedSolana || !input.storedUserId) return false;
  if (input.solanaWalletCount > 0) return false;
  if (input.alreadyResyncedUserId === input.storedUserId) return false;
  return true;
}
