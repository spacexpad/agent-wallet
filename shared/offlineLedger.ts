import { messageBytes, signatureBase58, signatureBase64 } from './message.ts';
import { decideOffline, type OfflineRequest } from './offlinePolicy.ts';
import type { ChainId } from './types.ts';

export type OwnerPolicy = {
  paused: boolean;
  whitelist: string[];
  fullAccess: boolean;
  whitelistEnabled: boolean;
  maxNative: Record<string, string> | null;
};

export type PairRecord = {
  code: string;
  expiresAt: number;
  ownerHash: string;
  bindToken?: string;
  tokenHash?: string;
  agentId?: string;
  agentName?: string;
  redeemed?: boolean;
};

export type BindingRecord = {
  tokenHash: string;
  ownerHash: string;
  agentId: string;
  agentName: string;
  userId: string;
  solanaAddress: string;
  evmAddress: string | null;
  solanaWalletId: string;
  evmWalletId: string | null;
  granted: boolean;
  revoked: boolean;
  paused: boolean;
  whitelist: string[];
  fullAccess: boolean;
  whitelistEnabled: boolean;
  maxNative: Record<string, string> | null;
};

export type LedgerState = {
  owners: OwnerPolicy[];
  ownerHashes: string[];
  pairs: PairRecord[];
  bindings: BindingRecord[];
};

export type PrivyOffline = {
  signMessage(input: { walletId: string; message: Uint8Array }): Promise<{ signature: Uint8Array }>;
  signTransaction(input: { walletId: string; serialized: string; chain: ChainId; network: string }): Promise<{ signedTransaction: string }>;
  sendTransaction(input: { walletId: string; serialized: string; chain: ChainId; network: string }): Promise<{ hash: string; signedTransaction: string }>;
};

export function emptyLedger(): LedgerState {
  return { owners: [], ownerHashes: [], pairs: [], bindings: [] };
}

export async function registerPair(state: LedgerState, input: { code: string; expiresAt: number; ownerKey: string }): Promise<LedgerState> {
  const ownerHash = await sha256Hex(input.ownerKey);
  const next = clone(state);
  ensureOwner(next, ownerHash);
  const existing = next.pairs.find((pair) => pair.code === input.code);
  if (existing) return next;
  next.pairs.push({ code: input.code, expiresAt: input.expiresAt, ownerHash });
  return next;
}

export async function issuePair(
  state: LedgerState,
  input: { code: string; agentName: string; now: number; token?: string; agentId?: string },
): Promise<{ state: LedgerState; bindToken: string; agentId: string; agentName: string }> {
  const next = clone(state);
  const pair = next.pairs.find((item) => item.code === input.code);
  if (!pair || pair.expiresAt < input.now) throw new Error('That pairing code is unknown or expired.');
  if (pair.bindToken && pair.agentId && pair.agentName) {
    return { state: next, bindToken: pair.bindToken, agentId: pair.agentId, agentName: pair.agentName };
  }
  const name = input.agentName.replace(/[^\p{L}\p{N} ._'-]/gu, '').trim().slice(0, 40) || 'Agent';
  const bindToken = input.token ?? (await randomToken());
  const agentId = input.agentId ?? (await randomId('agent_'));
  pair.bindToken = bindToken;
  pair.tokenHash = await sha256Hex(bindToken);
  pair.agentId = agentId;
  pair.agentName = name;
  return { state: next, bindToken, agentId, agentName: name };
}

export async function redeemPair(
  state: LedgerState,
  input: { code: string; bindToken: string; ownerKey: string; now: number },
): Promise<{ state: LedgerState; agentId: string; agentName: string }> {
  const next = clone(state);
  const pair = next.pairs.find((item) => item.code === input.code);
  if (!pair || pair.expiresAt < input.now) throw new Error('That pairing code expired. Copy a new prompt.');
  if (!pair.bindToken || pair.bindToken !== input.bindToken || !pair.agentId || !pair.agentName) {
    throw new Error('That token was not recognized.');
  }
  if (!(await sameSecret(input.ownerKey, pair.ownerHash))) throw new Error('That token was not recognized.');
  pair.redeemed = true;
  return { state: next, agentId: pair.agentId, agentName: pair.agentName };
}

export async function grantOffline(
  state: LedgerState,
  input: {
    ownerKey: string;
    bindToken: string;
    userId: string;
    solanaAddress: string;
    evmAddress: string | null;
    solanaWalletId: string;
    evmWalletId: string | null;
  },
): Promise<LedgerState> {
  const next = clone(state);
  const pair = next.pairs.find((item) => item.bindToken === input.bindToken);
  if (!pair?.tokenHash || !pair.agentId || !pair.agentName) throw new Error('That token was not recognized.');
  if (!(await sameSecret(input.ownerKey, pair.ownerHash))) throw new Error('That token was not recognized.');
  const owner = ensureOwner(next, pair.ownerHash);
  const existing = next.bindings.find((item) => item.tokenHash === pair.tokenHash);
  const binding: BindingRecord = {
    tokenHash: pair.tokenHash,
    ownerHash: pair.ownerHash,
    agentId: pair.agentId,
    agentName: pair.agentName,
    userId: input.userId,
    solanaAddress: input.solanaAddress,
    evmAddress: input.evmAddress,
    solanaWalletId: input.solanaWalletId,
    evmWalletId: input.evmWalletId,
    granted: true,
    revoked: false,
    paused: owner.paused,
    whitelist: [...owner.whitelist],
    fullAccess: owner.fullAccess,
    whitelistEnabled: owner.whitelistEnabled,
    maxNative: owner.maxNative ? { ...owner.maxNative } : null,
  };
  if (existing) {
    const index = next.bindings.indexOf(existing);
    next.bindings[index] = binding;
  } else {
    next.bindings.push(binding);
  }
  return next;
}

export async function setOfflinePolicy(
  state: LedgerState,
  input: {
    ownerKey: string;
    paused: boolean;
    whitelist: string[];
    fullAccess?: boolean;
    whitelistEnabled?: boolean;
    maxNative?: Record<string, string> | null;
  },
): Promise<LedgerState> {
  const next = clone(state);
  const ownerHash = await sha256Hex(input.ownerKey);
  const owner = ensureOwner(next, ownerHash);
  owner.paused = input.paused;
  owner.whitelist = [...input.whitelist];
  if (input.fullAccess !== undefined) owner.fullAccess = input.fullAccess;
  if (input.whitelistEnabled !== undefined) owner.whitelistEnabled = input.whitelistEnabled;
  if (input.maxNative !== undefined) owner.maxNative = input.maxNative ? { ...input.maxNative } : null;
  for (const binding of next.bindings) {
    if (binding.ownerHash !== ownerHash) continue;
    binding.paused = input.paused;
    binding.whitelist = [...input.whitelist];
    binding.fullAccess = owner.fullAccess;
    binding.whitelistEnabled = owner.whitelistEnabled;
    binding.maxNative = owner.maxNative ? { ...owner.maxNative } : null;
  }
  return next;
}

export async function revokeOffline(state: LedgerState, input: { ownerKey: string; bindToken: string }): Promise<LedgerState> {
  const next = clone(state);
  const tokenHash = await sha256Hex(input.bindToken);
  const binding = next.bindings.find((item) => item.tokenHash === tokenHash);
  if (!binding || !(await sameSecret(input.ownerKey, binding.ownerHash))) {
    throw new Error('That token was not recognized.');
  }
  binding.revoked = true;
  binding.granted = false;
  return next;
}

export async function executeOffline(
  state: LedgerState,
  bindToken: string,
  request: OfflineRequest,
  privy: PrivyOffline,
): Promise<{ ok: true; result: unknown } | { ok: false; error: string; code?: string }> {
  const tokenHash = await sha256Hex(bindToken);
  const binding = state.bindings.find((item) => item.tokenHash === tokenHash);
  if (!binding) return { ok: false, error: 'This binding token is not recognized.', code: 'unbound' };
  const decision = decideOffline(
    {
      granted: binding.granted,
      revoked: binding.revoked,
      paused: binding.paused,
      whitelist: binding.whitelist,
      fullAccess: binding.fullAccess,
      whitelistEnabled: binding.whitelistEnabled,
      maxNative: binding.maxNative,
    },
    request,
  );
  if (!decision.ok) return decision;
  if (request.method === 'sign_message') {
    const bytes = messageBytes(request.message ?? '', request.encoding ?? 'utf8');
    const signed = await privy.signMessage({ walletId: binding.solanaWalletId, message: bytes });
    return {
      ok: true,
      result: {
        chain: 'solana',
        network: decision.network,
        publicKey: binding.solanaAddress,
        signature: signatureBase64(signed.signature),
        signatureEncoding: 'base64',
        signatureBase58: signatureBase58(signed.signature),
        messageEncoding: request.encoding ?? 'utf8',
      },
    };
  }
  const walletId = request.chain === 'solana' ? binding.solanaWalletId : binding.evmWalletId;
  if (!walletId) return { ok: false, error: 'Offline signing for this chain is not granted yet.', code: 'chain' };
  if (!request.serialized) {
    return { ok: false, error: 'Offline native transfers need a serialized unsigned transaction. Nothing was signed.', code: 'invalid' };
  }
  if (request.method === 'sign') {
    const signed = await privy.signTransaction({
      walletId,
      serialized: request.serialized,
      chain: request.chain,
      network: decision.network,
    });
    return {
      ok: true,
      result: { chain: request.chain, network: decision.network, status: 'signed', hash: null, signedTransaction: signed.signedTransaction },
    };
  }
  const sent = await privy.sendTransaction({
    walletId,
    serialized: request.serialized,
    chain: request.chain,
    network: decision.network,
  });
  return {
    ok: true,
    result: {
      chain: request.chain,
      network: decision.network,
      status: 'submitted',
      hash: sent.hash,
      signedTransaction: sent.signedTransaction,
    },
  };
}

function ensureOwner(state: LedgerState, ownerHash: string): OwnerPolicy {
  const index = state.ownerHashes.indexOf(ownerHash);
  if (index >= 0) return state.owners[index];
  const owner: OwnerPolicy = { paused: false, whitelist: [], fullAccess: true, whitelistEnabled: false, maxNative: null };
  state.ownerHashes.push(ownerHash);
  state.owners.push(owner);
  return owner;
}

function clone(state: LedgerState): LedgerState {
  return {
    owners: state.owners.map((owner) => ({
      paused: owner.paused,
      whitelist: [...owner.whitelist],
      fullAccess: owner.fullAccess !== false,
      whitelistEnabled: owner.whitelistEnabled === true,
      maxNative: owner.maxNative ? { ...owner.maxNative } : null,
    })),
    ownerHashes: [...state.ownerHashes],
    pairs: state.pairs.map((pair) => ({ ...pair })),
    bindings: state.bindings.map((binding) => ({
      ...binding,
      whitelist: [...binding.whitelist],
      fullAccess: binding.fullAccess !== false,
      whitelistEnabled: binding.whitelistEnabled === true,
      maxNative: binding.maxNative ? { ...binding.maxNative } : null,
    })),
  };
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function sameSecret(secret: string, hash: string): Promise<boolean> {
  const actual = await sha256Hex(secret);
  if (actual.length !== hash.length) return false;
  let diff = 0;
  for (let index = 0; index < actual.length; index += 1) diff |= actual.charCodeAt(index) ^ hash.charCodeAt(index);
  return diff === 0;
}

async function randomToken(): Promise<string> {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return `spx_bind_${[...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}

async function randomId(prefix: string): Promise<string> {
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  return `${prefix}${[...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}
