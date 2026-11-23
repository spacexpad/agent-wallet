import { offlinePolicyBody } from './offlineClient.ts';
import type { Settings, Store } from '../../shared/types.ts';

export type PairRegistration = {
  registered: boolean;
  authError: string | null;
  bridgeError: string | null;
};

const BRIDGE_DOWN = 'The agent bridge is not running.';

export function isBridgeUnavailable(error: unknown): boolean {
  return error instanceof Error && error.message === BRIDGE_DOWN;
}

export function redeemTargets(input: { authUrl: string; bridgeToken: string }): Array<'auth' | 'bridge'> {
  const steps: Array<'auth' | 'bridge'> = [];
  if (input.authUrl.trim()) steps.push('auth');
  if (input.bridgeToken.trim()) steps.push('bridge');
  return steps;
}

export async function registerPendingPair(
  settings: Settings,
  pair: { code: string; expiresAt: number },
  deps: {
    registerBridge: (settings: Settings, pair: { code: string; expiresAt: number }) => Promise<boolean>;
    postAuth: (settings: Settings, path: string, body: unknown) => Promise<Record<string, unknown>>;
    ensureOwnerKey: () => Promise<string>;
  },
): Promise<PairRegistration> {
  const hasBridgeToken = Boolean(settings.bridgeToken.trim());
  let bridgeReady = false;
  let bridgeError: string | null = null;
  if (hasBridgeToken) {
    try {
      bridgeReady = await deps.registerBridge(settings, pair);
    } catch (error) {
      bridgeReady = false;
      if (!isBridgeUnavailable(error)) bridgeError = message(error, 'The agent bridge could not register this pairing code.');
    }
  }
  let authError: string | null = null;
  let authReady = !settings.authUrl.trim();
  if (settings.authUrl.trim()) {
    try {
      const ownerKey = await deps.ensureOwnerKey();
      await deps.postAuth({ ...settings, ownerKey }, '/v1/pair/register', {
        pairCode: pair.code,
        expiresAt: pair.expiresAt,
        ownerKey,
      });
      authReady = true;
    } catch (error) {
      authError = message(error, 'The authorization service could not register this pairing code.');
    }
  }
  return {
    registered: hasBridgeToken && bridgeReady && authReady && bridgeError === null && authError === null,
    authError,
    bridgeError,
  };
}

export async function redeemBindToken(input: {
  authUrl: string;
  bridgeToken: string;
  pairCode: string;
  bindToken: string;
  ownerKey: string;
  postAuth: (path: string, body: Record<string, unknown>) => Promise<Record<string, unknown>>;
  postBridge: (path: string, body: Record<string, unknown>) => Promise<Record<string, unknown>>;
}): Promise<Record<string, unknown>> {
  const steps = redeemTargets(input);
  if (steps.length === 0) throw new Error('No authorization service URL is configured.');
  let body: Record<string, unknown> | null = null;
  for (const step of steps) {
    if (step === 'auth') {
      body = await input.postAuth('/v1/pair/redeem', {
        pairCode: input.pairCode,
        bindToken: input.bindToken,
        ownerKey: input.ownerKey,
      });
      continue;
    }
    try {
      const local = await input.postBridge('/v1/pair/redeem', {
        pairCode: input.pairCode,
        bindToken: input.bindToken,
      });
      if (!body) body = local;
    } catch (error) {
      // The authorization service is the binding of record. A local bridge that never
      // issued this token, or one that is not running, must not block that grant.
      if (body) continue;
      throw error;
    }
  }
  if (!body) throw new Error('That token was not recognized.');
  return body;
}

export async function runOfflineGrant(input: {
  store: Store;
  token: string;
  userId: string;
  solanaAddress: string;
  evmAddress: string | null;
  solanaWalletId: string;
  evmWalletId: string | null;
  quorumId: string;
  addSigners: (args: { address: string; signers: Array<{ signerId: string }> }) => Promise<unknown>;
  postAuth: (settings: Settings, path: string, body: unknown) => Promise<unknown>;
  ensureOwnerKey: () => Promise<string>;
  updateStore: (patch: (current: Store) => Store) => Promise<Store>;
}): Promise<void> {
  if (!input.solanaAddress || !input.solanaWalletId) {
    throw new Error('This Solana wallet has no Privy wallet id yet, so offline signing cannot be granted.');
  }
  await input.addSigners({ address: input.solanaAddress, signers: [{ signerId: input.quorumId }] });
  if (input.evmAddress && input.evmWalletId) {
    await input.addSigners({ address: input.evmAddress, signers: [{ signerId: input.quorumId }] });
  }
  const ownerKey = await input.ensureOwnerKey();
  const settings = { ...input.store.settings, ownerKey };
  const latest = { ...input.store, settings };
  await input.postAuth(settings, '/v1/policy', offlinePolicyBody(latest, ownerKey));
  await input.postAuth(settings, '/v1/grant', {
    ownerKey,
    bindToken: input.token,
    userId: input.userId,
    solanaAddress: input.solanaAddress,
    evmAddress: input.evmAddress,
    solanaWalletId: input.solanaWalletId,
    evmWalletId: input.evmWalletId,
  });
  await input.updateStore((current) => ({
    ...current,
    settings: { ...current.settings, ownerKey: current.settings.ownerKey || ownerKey },
    agents: current.agents.map((agent) => (agent.token === input.token ? { ...agent, offlineGranted: true } : agent)),
  }));
}

function message(error: unknown, fallback: string): string {
  return error instanceof Error && error.message.trim() ? error.message : fallback;
}
