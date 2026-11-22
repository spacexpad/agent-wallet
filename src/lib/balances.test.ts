import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { clusterRpcUrl } from '../../shared/chains.ts';
import { readClusterBalance } from './balances.ts';

const LABS = 'https://api.mainnet-beta.solana.com';
const ADDRESS = 'SoLanaAddress11111111111111111111111111111';

describe('balance reads use the resolved RPC', () => {
  it('does not rewrite a user-supplied Solana Labs URL', async () => {
    const seen: string[] = [];
    const original = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      seen.push(url);
      if (url === LABS) {
        const body = JSON.parse(String(init?.body)) as { method?: string };
        if (body.method === 'getBalance') {
          return new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result: { value: 1 } }));
        }
        return new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result: { value: [] } }));
      }
      if (url.startsWith('https://coins.llama.fi/')) return new Response(JSON.stringify({ coins: {} }));
      throw new Error(`unexpected fetch ${url}`);
    }) as typeof fetch;
    try {
      const snapshot = await readClusterBalance({
        chain: 'solana',
        network: 'mainnet',
        solanaAddress: ADDRESS,
        evmAddress: null,
        rpcUrl: LABS,
        now: 1,
      });
      assert.equal(snapshot.status, 'ready');
      assert.equal(seen.includes(LABS), true);
      assert.equal(seen.some((url) => url.includes('publicnode')), false);
    } finally {
      globalThis.fetch = original;
    }
  });

  it('fetches PublicNode when the packed public URL is the Labs endpoint', async () => {
    const rpcUrl = clusterRpcUrl({ rpc: { 'solana:mainnet': LABS }, rpcOverrides: {} }, 'solana', 'mainnet');
    const seen: string[] = [];
    const original = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      seen.push(url);
      if (url === rpcUrl) {
        const body = JSON.parse(String(init?.body)) as { method?: string };
        if (body.method === 'getBalance') {
          return new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result: { value: 2 } }));
        }
        return new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result: { value: [] } }));
      }
      if (url.startsWith('https://coins.llama.fi/')) return new Response(JSON.stringify({ coins: {} }));
      throw new Error(`unexpected fetch ${url}`);
    }) as typeof fetch;
    try {
      const snapshot = await readClusterBalance({
        chain: 'solana',
        network: 'mainnet',
        solanaAddress: ADDRESS,
        evmAddress: null,
        rpcUrl,
        now: 1,
      });
      assert.equal(snapshot.status, 'ready');
      assert.equal(rpcUrl, 'https://solana-rpc.publicnode.com');
      assert.equal(seen[0], 'https://solana-rpc.publicnode.com');
    } finally {
      globalThis.fetch = original;
    }
  });
});