import type { Settings, Store } from '../../shared/types.ts';
import { loadStore, updateStore } from './storage.ts';

export async function ensureOwnerKey(): Promise<string> {
  const store = await loadStore();
  if (store.settings.ownerKey) return store.settings.ownerKey;
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const ownerKey = [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  const next = await updateStore((current) => ({
    ...current,
    settings: { ...current.settings, ownerKey: current.settings.ownerKey || ownerKey },
  }));
  return next.settings.ownerKey;
}

export function offlinePolicyBody(store: Store, ownerKey: string, paused = store.policy.agentsPaused): Record<string, unknown> {
  return {
    ownerKey,
    paused,
    whitelist: store.policy.whitelist.map((entry) => entry.address),
    whitelistEnabled: store.policy.whitelistEnabled,
    fullAccess: store.policy.fullAccess,
  };
}

export async function authPost(settings: Settings, path: string, body: unknown): Promise<Record<string, unknown>> {
  if (!settings.authUrl.trim()) throw new Error('No authorization service URL is configured.');
  const response = await fetch(`${settings.authUrl.replace(/\/+$/, '')}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  });
  const text = await response.text();
  const json = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  if (!response.ok) throw new Error(typeof json.error === 'string' ? json.error : `Authorization service returned ${response.status}.`);
  return json;
}

type AccountLike = {
  type?: string;
  chainType?: string;
  walletClientType?: string;
  id?: string | null;
};

export function embeddedWalletId(
  user: { linkedAccounts?: readonly AccountLike[] } | null,
  chain: 'solana' | 'ethereum',
): string | null {
  for (const account of user?.linkedAccounts ?? []) {
    if (account.type !== 'wallet' || account.chainType !== chain) continue;
    if (account.walletClientType !== 'privy' && account.walletClientType !== 'privy-v2') continue;
    if (typeof account.id === 'string' && account.id.length > 0) return account.id;
  }
  return null;
}
