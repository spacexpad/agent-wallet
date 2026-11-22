import {
  emptyLedger,
  executeOffline,
  grantOffline,
  issuePair,
  redeemPair,
  registerPair,
  revokeOffline,
  setOfflinePolicy,
  type LedgerState,
  type PrivyOffline,
} from './offlineLedger.ts';
import type { OfflineRequest } from './offlinePolicy.ts';
import type { ChainId } from './types.ts';

export type AuthDeps = {
  now: () => number;
  privy: PrivyOffline;
};

export async function handleAuthRequest(state: LedgerState, request: Request, deps: AuthDeps): Promise<{ state: LedgerState; response: Response; persist: boolean }> {
  const url = new URL(request.url);
  if (request.method === 'GET' && url.pathname === '/v1/health') {
    return { state, persist: false, response: json(200, { ok: true }) };
  }
  if (request.method !== 'POST') return { state, persist: false, response: json(404, { error: 'Not found.' }) };
  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return { state, persist: false, response: json(400, { error: 'Request body must be JSON.' }) };
  }
  try {
    if (url.pathname === '/v1/pair/register') {
      const next = await registerPair(state, {
        code: text(body, 'pairCode'),
        expiresAt: Number(body.expiresAt),
        ownerKey: text(body, 'ownerKey'),
      });
      return { state: next, persist: true, response: json(200, { ok: true }) };
    }
    if (url.pathname === '/v1/pair/issue') {
      const issued = await issuePair(state, {
        code: text(body, 'pairCode'),
        agentName: text(body, 'agentName'),
        now: deps.now(),
      });
      return {
        state: issued.state,
        persist: true,
        response: json(200, { bindToken: issued.bindToken, agentId: issued.agentId, agentName: issued.agentName }),
      };
    }
    if (url.pathname === '/v1/pair/redeem') {
      const redeemed = await redeemPair(state, {
        code: text(body, 'pairCode'),
        bindToken: text(body, 'bindToken'),
        ownerKey: text(body, 'ownerKey'),
        now: deps.now(),
      });
      return { state: redeemed.state, persist: true, response: json(200, { agentId: redeemed.agentId, agentName: redeemed.agentName }) };
    }
    if (url.pathname === '/v1/grant') {
      const next = await grantOffline(state, {
        ownerKey: text(body, 'ownerKey'),
        bindToken: text(body, 'bindToken'),
        userId: text(body, 'userId'),
        solanaAddress: text(body, 'solanaAddress'),
        evmAddress: optionalText(body, 'evmAddress'),
        solanaWalletId: text(body, 'solanaWalletId'),
        evmWalletId: optionalText(body, 'evmWalletId'),
      });
      return { state: next, persist: true, response: json(200, { ok: true }) };
    }
    if (url.pathname === '/v1/policy') {
      const addresses = Array.isArray(body.whitelist) ? body.whitelist.filter((item): item is string => typeof item === 'string') : [];
      const maxNative = nativeCaps(body.maxNative);
      const next = await setOfflinePolicy(state, {
        ownerKey: text(body, 'ownerKey'),
        paused: body.paused === true,
        whitelist: addresses,
        fullAccess: body.fullAccess !== false,
        whitelistEnabled: body.whitelistEnabled === true,
        maxNative,
      });
      return { state: next, persist: true, response: json(200, { ok: true }) };
    }
    if (url.pathname === '/v1/revoke') {
      const next = await revokeOffline(state, { ownerKey: text(body, 'ownerKey'), bindToken: text(body, 'bindToken') });
      return { state: next, persist: true, response: json(200, { ok: true }) };
    }
    if (url.pathname === '/v1/sign-message' || url.pathname === '/v1/sign-transaction' || url.pathname === '/v1/send-transaction') {
      const bindToken = bearer(request) || text(body, 'bindToken');
      const offline = offlineRequest(url.pathname, body);
      const result = await executeOffline(state, bindToken, offline, deps.privy);
      return { state, persist: false, response: json(result.ok ? 200 : 403, result) };
    }
  } catch (error) {
    return { state, persist: false, response: json(400, { error: error instanceof Error ? error.message : 'Request failed.' }) };
  }
  return { state, persist: false, response: json(404, { error: 'Not found.' }) };
}

export function emptyAuthState(): LedgerState {
  return emptyLedger();
}

function offlineRequest(path: string, body: Record<string, unknown>): OfflineRequest {
  if (path === '/v1/sign-message') {
    return {
      method: 'sign_message',
      chain: 'solana',
      network: optionalText(body, 'network') ?? undefined,
      message: text(body, 'message'),
      encoding: encodingOf(body.encoding),
    };
  }
  const method = path === '/v1/send-transaction' ? 'send' : 'sign';
  const chain = text(body, 'chain') as ChainId;
  return {
    method,
    chain,
    network: optionalText(body, 'network') ?? undefined,
    kind: body.kind === 'native_transfer' ? 'native_transfer' : 'serialized',
    to: optionalText(body, 'to') ?? undefined,
    amount: optionalText(body, 'amount') ?? undefined,
    serialized: optionalText(body, 'serialized') ?? undefined,
  };
}

function encodingOf(value: unknown): 'utf8' | 'hex' | 'base64' {
  if (value === 'hex' || value === 'base64' || value === 'utf8') return value;
  return 'utf8';
}

function text(body: Record<string, unknown>, key: string): string {
  const value = body[key];
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`Missing ${key}.`);
  return value;
}

function optionalText(body: Record<string, unknown>, key: string): string | null {
  const value = body[key];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function bearer(request: Request): string {
  const header = request.headers.get('authorization') ?? '';
  return header.startsWith('Bearer ') ? header.slice(7) : '';
}

function nativeCaps(value: unknown): Record<string, string> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const caps: Record<string, string> = {};
  for (const [key, amount] of Object.entries(value)) {
    if (typeof amount === 'string' && amount.trim()) caps[key] = amount.trim();
  }
  return Object.keys(caps).length > 0 ? caps : null;
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}
