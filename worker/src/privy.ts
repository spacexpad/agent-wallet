import { messageBytes } from '../../shared/message.ts';
import type { PrivyOffline } from '../../shared/offlineLedger.ts';
import { authorizationPayload, canonicalize, signAuthorizationPayload, solanaMessageRpc } from '../../shared/privyAuth.ts';
import type { ChainId } from '../../shared/types.ts';

export type PrivyEnv = {
  PRIVY_APP_ID?: string;
  PRIVY_APP_SECRET?: string;
  PRIVY_AUTHORIZATION_PRIVATE_KEY?: string;
};

const RPC = 'https://api.privy.io/v1/wallets';

export function createHttpPrivy(env: PrivyEnv): PrivyOffline {
  return {
    async signMessage(input) {
      const body = solanaMessageRpc(input.message);
      const response = await rpc(env, input.walletId, body);
      const signature = base64ToBytes(response.signature);
      return { signature };
    },
    async signTransaction(input) {
      const signed = await rpc(env, input.walletId, transactionBody('signTransaction', input));
      return { signedTransaction: signed.signed_transaction };
    },
    async sendTransaction(input) {
      const sent = await rpc(env, input.walletId, transactionBody('signAndSendTransaction', input));
      return { hash: sent.hash, signedTransaction: sent.signed_transaction ?? '' };
    },
  };
}

function transactionBody(
  method: 'signTransaction' | 'signAndSendTransaction',
  input: { serialized: string; chain: ChainId; network: string },
): unknown {
  return {
    method,
    params: {
      transaction: input.serialized,
      encoding: 'base64',
    },
    caip2: input.chain === 'solana' ? (input.network === 'devnet' ? 'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1' : 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp') : undefined,
  };
}

async function rpc(env: PrivyEnv, walletId: string, body: unknown): Promise<{ signature: string; signed_transaction: string; hash: string }> {
  const appId = required(env.PRIVY_APP_ID, 'PRIVY_APP_ID');
  const appSecret = required(env.PRIVY_APP_SECRET, 'PRIVY_APP_SECRET');
  const authorizationKey = required(env.PRIVY_AUTHORIZATION_PRIVATE_KEY, 'PRIVY_AUTHORIZATION_PRIVATE_KEY');
  const url = `${RPC}/${walletId}/rpc`;
  const payload = canonicalize(authorizationPayload({ url, body, appId }));
  const pkcs8 = pkcs8Bytes(authorizationKey);
  const signature = await signAuthorizationSignature(pkcs8, payload);
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      authorization: `Basic ${btoa(`${appId}:${appSecret}`)}`,
      'content-type': 'application/json',
      'privy-app-id': appId,
      'privy-authorization-signature': signature,
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`Privy rejected the wallet request (${response.status}).`);
  const json = (await response.json()) as { data?: { signature?: string; signed_transaction?: string; hash?: string } };
  return {
    signature: json.data?.signature ?? '',
    signed_transaction: json.data?.signed_transaction ?? '',
    hash: json.data?.hash ?? '',
  };
}

async function signAuthorizationSignature(pkcs8: Uint8Array, payload: string): Promise<string> {
  return signAuthorizationPayload(pkcs8, payload);
}

function pkcs8Bytes(value: string): Uint8Array {
  const trimmed = value.replace(/^wallet-auth:/, '').replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  const binary = atob(trimmed);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function required(value: string | undefined, name: string): string {
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
}

export function exactMessageBytes(message: string, encoding: 'utf8' | 'hex' | 'base64' = 'utf8'): Uint8Array {
  return messageBytes(message, encoding);
}
