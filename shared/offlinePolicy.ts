import { resolveCluster } from './chains.ts';
import { parseDecimal } from './money.ts';
import type { ChainId } from './types.ts';

export const NEEDS_CONFIRMATION =
  'This request needs confirmation in the wallet, and the wallet is offline for this request.';

export type OfflineKind = 'sign_message' | 'sign' | 'send';

export type OfflineRequest = {
  method: OfflineKind;
  chain: ChainId;
  network?: string;
  kind?: 'native_transfer' | 'serialized';
  to?: string;
  amount?: string;
  serialized?: string;
  message?: string;
  encoding?: 'utf8' | 'hex' | 'base64';
};

export type OfflineBinding = {
  granted: boolean;
  revoked: boolean;
  paused: boolean;
  whitelist: string[];
  /** Missing means full access, matching the extension default. */
  fullAccess?: boolean;
  /** Missing means the whitelist is off. An empty list does not block. */
  whitelistEnabled?: boolean;
  /** Native-unit caps. Applied only when full access is off and a cap is set. */
  maxNative?: Record<string, string> | null;
};

export function decideOffline(binding: OfflineBinding, request: OfflineRequest): { ok: true; network: string } | { ok: false; error: string; code: string } {
  if (binding.revoked) {
    return { ok: false, error: 'This binding was revoked. Nothing was signed.', code: 'revoked' };
  }
  if (!binding.granted) {
    return { ok: false, error: 'This agent is not authorized for offline signing.', code: 'not-granted' };
  }
  if (binding.paused) {
    return { ok: false, error: 'Agents are paused. Nothing was signed.', code: 'paused' };
  }
  let network = 'mainnet';
  try {
    network = resolveCluster(request.chain, request.network).network;
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Unsupported network.', code: 'network' };
  }
  if (request.method === 'sign_message') {
    if (request.chain !== 'solana') {
      return { ok: false, error: 'Message signing currently supports Solana only. Pass chain "solana".', code: 'chain' };
    }
    return { ok: true, network };
  }
  if (request.kind === 'native_transfer') {
    if (!request.to || !request.amount) {
      return { ok: false, error: 'Native transfer needs to and amount.', code: 'invalid' };
    }
  } else if (!request.serialized) {
    return { ok: false, error: 'Serialized transaction is missing.', code: 'invalid' };
  }
  if (binding.whitelistEnabled === true) {
    if (binding.whitelist.length === 0) return needsConfirmation('whitelist');
    if (!request.to || !listed(binding.whitelist, request.to)) return needsConfirmation('whitelist');
  }
  if (binding.fullAccess === false) {
    const cap = binding.maxNative?.[request.chain];
    if (!cap || !request.amount || overCap(binding, request.chain, request.amount)) return needsConfirmation('limit');
  }
  return { ok: true, network };
}

function needsConfirmation(code: string): { ok: false; error: string; code: string } {
  return { ok: false, error: NEEDS_CONFIRMATION, code };
}

function listed(whitelist: string[], address: string): boolean {
  return whitelist.some((entry) => same(entry, address));
}

function same(left: string, right: string): boolean {
  if (left.startsWith('0x') || left.startsWith('0X') || right.startsWith('0x') || right.startsWith('0X')) {
    return left.toLowerCase() === right.toLowerCase();
  }
  return left === right;
}

function overCap(binding: OfflineBinding, chain: ChainId, amount: string): boolean {
  const cap = binding.maxNative?.[chain];
  if (!cap) return true;
  const decimals = chain === 'solana' ? 9 : 18;
  try {
    return parseDecimal(amount, decimals) > parseDecimal(cap, decimals);
  } catch {
    return true;
  }
}
