import { DEFAULT_RPCS, mergePackedRpc, sanitizeRpcOverrides } from './chains.ts';
import type { Settings, Store } from './types.ts';
import { DEFAULT_POLICY } from './types.ts';

export const BRIDGE_URL = 'http://127.0.0.1:47321';
export const DEFAULT_AUTH_URL = 'https://spacexpad-agent-wallet-auth.timmy2048.workers.dev';
export const DEFAULT_KEY_QUORUM_ID = 'nzzqzkcm5vuy8ed6x3wlibww';

export function offlineSigningEnabled(value: boolean | null | undefined): boolean {
  return value !== false;
}

export function shouldAutoGrantOffline(input: {
  offlineSigning: boolean | null | undefined;
  authenticated: boolean;
  bound: boolean;
  alreadyGranted: boolean;
  hasSolanaAddress: boolean;
  hasWalletId: boolean;
}): boolean {
  if (!offlineSigningEnabled(input.offlineSigning)) return false;
  return input.authenticated && input.bound && !input.alreadyGranted && input.hasSolanaAddress && input.hasWalletId;
}

export function defaultSettings(): Settings {
  return {
    hydrated: false,
    privyAppId: '',
    privyClientId: '',
    bridgeUrl: BRIDGE_URL,
    bridgeToken: '',
    authUrl: DEFAULT_AUTH_URL,
    privyKeyQuorumId: DEFAULT_KEY_QUORUM_ID,
    ownerKey: '',
    rpc: { ...DEFAULT_RPCS },
    rpcOverrides: {},
    configError: null,
  };
}

export function defaultStore(): Store {
  return {
    version: 1,
    language: 'en',
    username: '',
    assetView: 'mainnet',
    auth: null,
    addresses: null,
    policy: { ...DEFAULT_POLICY, whitelist: [] },
    agents: [],
    activity: [],
    spend: { date: '', microUsd: '0' },
    snapshots: [],
    pair: null,
    pendingApproval: null,
    approval: null,
    settings: defaultSettings(),
    bridge: { connected: false, error: null, at: null },
    vaultError: null,
    offlineSigning: null,
  };
}

export function normalizeStore(value: unknown): Store {
  const base = defaultStore();
  if (!value || typeof value !== 'object') return base;
  const raw = value as Partial<Store>;
  const settings = raw.settings ?? base.settings;
  return {
    ...base,
    ...raw,
    version: 1,
    assetView: raw.assetView === 'test' ? 'test' : 'mainnet',
    policy: { ...base.policy, ...raw.policy, whitelist: raw.policy?.whitelist ?? [] },
    agents: raw.agents ?? [],
    activity: raw.activity ?? [],
    snapshots: raw.snapshots ?? [],
    spend: raw.spend ?? base.spend,
    settings: {
      ...base.settings,
      ...settings,
      rpc: mergePackedRpc(settings.rpc),
      rpcOverrides: sanitizeRpcOverrides(settings.rpcOverrides),
      authUrl: settings.authUrl || DEFAULT_AUTH_URL,
      privyKeyQuorumId: settings.privyKeyQuorumId || DEFAULT_KEY_QUORUM_ID,
      ownerKey: settings.ownerKey ?? '',
    },
    pendingApproval: pendingShape(raw.pendingApproval) ? raw.pendingApproval : null,
    approval: approvalShape(raw.approval) ? raw.approval : null,
    bridge: { ...base.bridge, ...raw.bridge },
    vaultError: raw.vaultError ?? null,
    offlineSigning: raw.offlineSigning === false ? false : null,
  };
}

function pendingShape(value: Store['pendingApproval'] | undefined): value is NonNullable<Store['pendingApproval']> {
  return Boolean(
    value &&
      typeof value.id === 'string' &&
      (value.method === 'sign' || value.method === 'send' || value.method === 'sign_message'),
  );
}

function approvalShape(value: Store['approval'] | undefined): value is NonNullable<Store['approval']> {
  return Boolean(value && typeof value.id === 'string' && typeof value.allow === 'boolean');
}

export function isDisplayName(value: string): boolean {
  return /^[\p{L}\p{N}_]{2,24}$/u.test(value);
}

export function walletReady(store: { agents: readonly unknown[] }): boolean {
  return store.agents.length > 0;
}

export function hasAppId(settings: Settings): boolean {
  const id = settings.privyAppId.trim();
  return id.length > 8 && !id.includes('YOUR_PRIVY');
}
