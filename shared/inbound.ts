import type { ChainId, Inbound, MessageEncoding, TxKind, TxParams } from './types.ts';

const CHAINS = new Set<string>(['solana', 'ethereum', 'base', 'bnb']);
const MESSAGE_METHODS = new Set(['sign_message', 'signMessage', 'spacexpad_sign_message']);
const ENCODINGS = new Set<string>(['utf8', 'hex', 'base64']);

export function isBindToken(value: string): boolean {
  return /^spx_bind_[a-f0-9]{48}$/.test(value);
}

export function messageInbound(
  id: string,
  params: { bindToken: string; chain: ChainId; network?: string; message: string; encoding?: MessageEncoding },
): Inbound {
  return classifyInbound({
    id,
    method: 'sign_message',
    params: {
      bindToken: params.bindToken,
      chain: params.chain,
      network: params.network,
      message: params.message,
      encoding: params.encoding ?? 'utf8',
    },
  });
}

// A message payload has no transaction body. Classifying it here is what keeps
// quoteTransaction from seeing it: that function throws "Serialized transaction
// is missing." for every non-native payload without `serialized`.
export function classifyInbound(raw: unknown): Inbound {
  if (!raw || typeof raw !== 'object') throw new Error('Request was empty.');
  const body = raw as Record<string, unknown>;
  const id = typeof body.id === 'string' ? body.id : '';
  const method = typeof body.method === 'string' ? body.method.trim() : '';
  const params = body.params && typeof body.params === 'object' ? (body.params as Record<string, unknown>) : {};
  const bindToken = typeof params.bindToken === 'string' ? params.bindToken : '';

  if (method === 'get_addresses') return { id, method: 'get_addresses', params: { bindToken } };

  const chain = typeof params.chain === 'string' ? params.chain : '';
  if (!CHAINS.has(chain)) throw new Error(`Unsupported chain ${chain || 'missing'}.`);
  const network = typeof params.network === 'string' ? params.network : undefined;
  const chainId = chain as ChainId;

  if (method === 'get_balance') return { id, method: 'get_balance', params: { bindToken, chain: chainId, network } };

  const message = typeof params.message === 'string' ? params.message : '';
  const serialized = typeof params.serialized === 'string' ? params.serialized : '';
  const kind: TxKind | undefined = params.kind === 'native_transfer' || params.kind === 'serialized' ? params.kind : undefined;
  const encoding = encodingOf(params.encoding);

  if (MESSAGE_METHODS.has(method) || (message.length > 0 && serialized.length === 0 && kind !== 'native_transfer')) {
    return {
      id,
      method: 'sign_message',
      params: { bindToken, chain: chainId, network, message, encoding },
    };
  }

  if (method === 'sign' || method === 'send') {
    const tx: TxParams = {
      bindToken,
      chain: chainId,
      network,
      kind: kind ?? 'serialized',
      to: typeof params.to === 'string' ? params.to : undefined,
      amount: typeof params.amount === 'string' ? params.amount : undefined,
      serialized: serialized || undefined,
    };
    return { id, method, params: tx };
  }

  throw new Error(`Unsupported method ${method || 'missing'}.`);
}

function encodingOf(value: unknown): MessageEncoding {
  if (value === undefined) return 'utf8';
  if (typeof value === 'string' && ENCODINGS.has(value)) return value as MessageEncoding;
  throw new Error('encoding must be utf8, hex, or base64.');
}
