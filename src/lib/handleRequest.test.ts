import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { signatureBase58 } from '../../shared/message.ts';
import { defaultStore } from '../../shared/store.ts';
import type { Inbound, Snapshot, Store, TxParams } from '../../shared/types.ts';
import { handleAgentRequest, type HandlerDeps } from './handleRequest.ts';
import { quoteTransaction } from './quote.ts';

const TOKEN = `spx_bind_${'ab'.repeat(24)}`;

function readyStore(patch: Partial<Store> = {}): Store {
  return {
    ...defaultStore(),
    ...patch,
    agents: patch.agents ?? [{ id: 'agent_1', name: 'Claude', token: TOKEN, boundAt: 1 }],
    addresses: patch.addresses ?? {
      solana: 'SoLanaAddress11111111111111111111111111111',
      evm: '0x1111111111111111111111111111111111111111',
    },
    settings: {
      ...defaultStore().settings,
      hydrated: true,
      rpc: {
        'solana:mainnet': 'https://rpc.example/sol',
        'solana:devnet': 'https://rpc.example/sol-dev',
        'ethereum:mainnet': 'https://rpc.example/eth',
        'ethereum:testnet': 'https://rpc.example/eth-test',
        'base:mainnet': 'https://rpc.example/base',
        'base:testnet': 'https://rpc.example/base-test',
        'bnb:mainnet': 'https://rpc.example/bnb',
        'bnb:testnet': 'https://rpc.example/bnb-test',
      },
    },
  };
}

function harness(initial: Store, extras: Partial<HandlerDeps> = {}) {
  let store = initial;
  const signed: TxParams[] = [];
  const reads: string[] = [];
  const deps: HandlerDeps = {
    load: async () => store,
    update: async (patch) => {
      store = patch(store);
      return store;
    },
    sign: async (params) => {
      signed.push(params);
      return { signedTransaction: 'signed-in-test' };
    },
    confirm: async () => true,
    quote: async () => ({ destinations: ['0xabc'], transferMicroUsd: 1n }),
    readBalance: async (input) => {
      reads.push(`${input.chain}:${input.network}`);
      const snapshot: Snapshot = {
        chain: input.chain,
        network: input.network === 'devnet' || input.network === 'testnet' ? input.network : 'mainnet',
        status: 'ready',
        error: null,
        tokenListError: null,
        assets: [],
        readAt: 1,
      };
      return snapshot;
    },
    now: () => Date.parse('2026-11-21T00:00:00Z'),
    ...extras,
  };
  return { deps, signed, reads, current: () => store };
}

describe('mainnet view versus explicit network actions', () => {
  it('reads mainnet when a balance request omits the cluster', async () => {
    const box = harness(readyStore());
    const inbound: Inbound = { id: 'b1', method: 'get_balance', params: { bindToken: TOKEN, chain: 'base' } };
    const result = await handleAgentRequest(box.deps, inbound);
    assert.equal(result.ok, true);
    assert.deepEqual(box.reads, ['base:mainnet']);
    if (result.ok) {
      const body = result.result as { network: string };
      assert.equal(body.network, 'mainnet');
    }
  });

  it('signs on mainnet without a testnet confirmation when the cluster is omitted', async () => {
    let asked = false;
    const box = harness(readyStore(), {
      approveNonMainnet: async () => {
        asked = true;
        return false;
      },
    });
    const inbound: Inbound = {
      id: 's1',
      method: 'sign',
      params: { bindToken: TOKEN, chain: 'ethereum', kind: 'native_transfer', to: '0xabc', amount: '0.01' },
    };
    const result = await handleAgentRequest(box.deps, inbound);
    assert.equal(asked, false);
    assert.equal(result.ok, true);
    assert.equal(box.signed[0]?.network, 'mainnet');
    assert.equal(box.signed.length, 1);
  });

  it('signs an explicit devnet request for a bound agent without a confirmation popup', async () => {
    let asked = false;
    const box = harness(readyStore(), {
      approveNonMainnet: async () => {
        asked = true;
        return false;
      },
    });
    const inbound: Inbound = {
      id: 's2',
      method: 'sign',
      params: { bindToken: TOKEN, chain: 'solana', network: 'devnet', kind: 'native_transfer', to: 'dest', amount: '0.01' },
    };
    const result = await handleAgentRequest(box.deps, inbound);
    assert.equal(asked, false);
    assert.equal(box.current().pendingApproval, null);
    assert.equal(result.ok, true);
    assert.equal(box.signed[0]?.network, 'devnet');
    if (result.ok) {
      const body = result.result as { network: string; hash: string | null };
      assert.equal(body.network, 'devnet');
      assert.equal(body.hash, null);
    }
  });

  it('submits an explicit devnet send for a bound agent without a confirmation popup', async () => {
    let asked = false;
    const sent: TxParams[] = [];
    const box = harness(readyStore(), {
      approveNonMainnet: async () => {
        asked = true;
        return false;
      },
      sign: async (params) => {
        sent.push(params);
        return { hash: 'devnet-hash', signedTransaction: 'signed-in-test' };
      },
    });
    const result = await handleAgentRequest(box.deps, {
      id: 's3',
      method: 'send',
      params: { bindToken: TOKEN, chain: 'solana', network: 'devnet', kind: 'native_transfer', to: 'dest', amount: '0.01' },
    });
    assert.equal(asked, false);
    assert.equal(result.ok, true);
    assert.equal(sent[0]?.network, 'devnet');
    if (result.ok) {
      const body = result.result as { network: string; status: string; hash: string | null };
      assert.equal(body.network, 'devnet');
      assert.equal(body.status, 'submitted');
      assert.equal(body.hash, 'devnet-hash');
    }
  });

  it('rejects a Solana testnet label instead of treating it as devnet', async () => {
    const box = harness(readyStore());
    const inbound: Inbound = {
      id: 'b2',
      method: 'get_balance',
      params: { bindToken: TOKEN, chain: 'solana', network: 'testnet' },
    };
    const result = await handleAgentRequest(box.deps, inbound);
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.error, /devnet/);
    assert.deepEqual(box.reads, []);
  });

  it('still blocks mainnet signing when agents are paused', async () => {
    const box = harness(readyStore({ policy: { ...defaultStore().policy, agentsPaused: true } }));
    const inbound: Inbound = {
      id: 's4',
      method: 'send',
      params: { bindToken: TOKEN, chain: 'base', kind: 'native_transfer', to: '0xabc', amount: '1' },
    };
    const result = await handleAgentRequest(box.deps, inbound);
    assert.equal(result.ok, false);
    assert.equal(box.signed.length, 0);
    assert.equal(box.current().activity[0]?.network, 'mainnet');
    assert.equal(box.current().activity[0]?.status, 'blocked');
  });
});

describe('message signing', () => {
  const message = 'AgentPad Solana Gate Auth\nWallet: abc\nNonce: 1\nExpires: 2';

  it('signs a devnet challenge as a message and never quotes a transaction', async () => {
    const nacl = (await import('tweetnacl')).default;
    const pair = nacl.sign.keyPair();
    const address = signatureBase58(pair.publicKey);
    let asked = false;
    let quoted = false;
    let seen: Uint8Array | null = null;
    const box = harness(
      readyStore({ addresses: { solana: address, evm: '0x1111111111111111111111111111111111111111' } }),
      {
        approveNonMainnet: async () => {
          asked = true;
          return false;
        },
        quote: async (params, rpcUrl) => {
          quoted = true;
          return quoteTransaction(params, rpcUrl);
        },
        signMessage: async (input) => {
          seen = input.message;
          return { publicKey: address, signature: nacl.sign.detached(input.message, pair.secretKey) };
        },
      },
    );
    const result = await handleAgentRequest(box.deps, {
      id: 'm1',
      method: 'sign_message',
      params: { bindToken: TOKEN, chain: 'solana', network: 'devnet', message, encoding: 'utf8' },
    });
    assert.equal(asked, false);
    assert.equal(quoted, false);
    assert.equal(box.signed.length, 0);
    assert.equal(box.current().pendingApproval, null);
    assert.deepEqual(seen ? [...seen] : [], [...new TextEncoder().encode(message)]);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    const body = result.result as {
      signature: string;
      signatureBase58: string;
      signatureEncoding: string;
      publicKey: string;
      network: string;
      hash?: string;
      signedTransaction?: string;
    };
    assert.equal(body.publicKey, address);
    assert.equal(body.signatureEncoding, 'base64');
    assert.equal(body.network, 'devnet');
    assert.equal(body.hash, undefined);
    assert.equal(body.signedTransaction, undefined);
    const raw = Uint8Array.from(Buffer.from(body.signature, 'base64'));
    assert.equal(nacl.sign.detached.verify(new TextEncoder().encode(message), raw, pair.publicKey), true);
    assert.equal(body.signatureBase58, signatureBase58(raw));
    assert.equal(result.ok && !JSON.stringify(result).includes('Serialized transaction is missing.'), true);
  });

  it('routes a sign request that only carries message bytes away from quote.ts', async () => {
    const nacl = (await import('tweetnacl')).default;
    const pair = nacl.sign.keyPair();
    const address = signatureBase58(pair.publicKey);
    let quoted = false;
    const box = harness(
      readyStore({ addresses: { solana: address, evm: '0x1111111111111111111111111111111111111111' } }),
      {
        quote: async () => {
          quoted = true;
          throw new Error('Serialized transaction is missing.');
        },
        signMessage: async (input) => ({
          publicKey: address,
          signature: nacl.sign.detached(input.message, pair.secretKey),
        }),
      },
    );
    const result = await handleAgentRequest(box.deps, {
      id: 'm-misroute',
      method: 'sign',
      params: {
        bindToken: TOKEN,
        chain: 'solana',
        network: 'devnet',
        message,
        encoding: 'utf8',
      },
    } as unknown);
    assert.equal(quoted, false);
    assert.equal(box.signed.length, 0);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    const body = result.result as { signature: string; signatureBase58: string };
    const raw = Uint8Array.from(Buffer.from(body.signature, 'base64'));
    assert.equal(nacl.sign.detached.verify(new TextEncoder().encode(message), raw, pair.publicKey), true);
    assert.equal(body.signatureBase58, signatureBase58(raw));
    assert.equal(JSON.stringify(result).includes('Serialized transaction is missing.'), false);
  });

  it('signs hex and base64 messages as those exact bytes', async () => {
    const nacl = (await import('tweetnacl')).default;
    const pair = nacl.sign.keyPair();
    const address = signatureBase58(pair.publicKey);
    const raw = new TextEncoder().encode('hi');
    const hex = [...raw].map((byte) => byte.toString(16).padStart(2, '0')).join('');
    const base64 = Buffer.from(raw).toString('base64');
    const seen: Uint8Array[] = [];
    const box = harness(
      readyStore({ addresses: { solana: address, evm: '0x1111111111111111111111111111111111111111' } }),
      {
        signMessage: async (input) => {
          seen.push(input.message);
          return { publicKey: address, signature: nacl.sign.detached(input.message, pair.secretKey) };
        },
      },
    );
    const hexResult = await handleAgentRequest(box.deps, {
      id: 'm-hex',
      method: 'sign_message',
      params: { bindToken: TOKEN, chain: 'solana', message: `0x${hex}`, encoding: 'hex' },
    });
    const base64Result = await handleAgentRequest(box.deps, {
      id: 'm-b64',
      method: 'sign_message',
      params: { bindToken: TOKEN, chain: 'solana', message: base64, encoding: 'base64' },
    });
    assert.equal(hexResult.ok, true);
    assert.equal(base64Result.ok, true);
    assert.deepEqual([...(seen[0] ?? [])], [...raw]);
    assert.deepEqual([...(seen[1] ?? [])], [...raw]);
  });

  it('rejects ethereum and solana testnet instead of signing', async () => {
    let signed = false;
    const box = harness(readyStore(), {
      signMessage: async () => {
        signed = true;
        return { signature: new Uint8Array(64), publicKey: 'x' };
      },
    });
    const evm = await handleAgentRequest(box.deps, {
      id: 'm3',
      method: 'sign_message',
      params: { bindToken: TOKEN, chain: 'ethereum', message: 'hello' },
    });
    assert.equal(evm.ok, false);
    if (!evm.ok) assert.match(evm.error, /Solana only/);
    const testnet = await handleAgentRequest(box.deps, {
      id: 'm4',
      method: 'sign_message',
      params: { bindToken: TOKEN, chain: 'solana', network: 'testnet', message: 'hello' },
    });
    assert.equal(testnet.ok, false);
    if (!testnet.ok) assert.match(testnet.error, /devnet/);
    assert.equal(signed, false);
  });

  it('does not quote a message payload as a missing serialized transaction', async () => {
    await assert.rejects(
      () =>
        quoteTransaction(
          {
            bindToken: TOKEN,
            chain: 'solana',
            network: 'devnet',
            kind: 'serialized',
            message: message,
          } as TxParams & { message: string },
          'http://127.0.0.1:9',
        ),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.equal(error.message.includes('Serialized transaction is missing.'), false);
        assert.match(error.message, /cannot be quoted/);
        return true;
      },
    );
  });
});

describe('bound agent auto-sign guards', () => {
  it('rejects an unbound token and does not sign', async () => {
    const box = harness(readyStore({ agents: [] }));
    const result = await handleAgentRequest(box.deps, {
      id: 'u1',
      method: 'sign_message',
      params: { bindToken: TOKEN, chain: 'solana', message: 'hello' },
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.error, /not recognized/);
    assert.equal(box.signed.length, 0);
  });

  it('rejects a revoked binding and does not sign', async () => {
    const box = harness(readyStore());
    await box.deps.update((store) => ({ ...store, agents: [] }));
    const result = await handleAgentRequest(box.deps, {
      id: 'r1',
      method: 'send',
      params: { bindToken: TOKEN, chain: 'solana', network: 'devnet', kind: 'native_transfer', to: 'dest', amount: '0.01' },
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.error, /not recognized/);
    assert.equal(box.signed.length, 0);
    assert.equal(box.current().pendingApproval, null);
  });

  it('rejects a paused agent for sign, send, and sign_message', async () => {
    let messages = 0;
    const box = harness(readyStore({ policy: { ...defaultStore().policy, agentsPaused: true } }), {
      signMessage: async () => {
        messages += 1;
        return { signature: new Uint8Array(64), publicKey: 'x' };
      },
    });
    const sign = await handleAgentRequest(box.deps, {
      id: 'p1',
      method: 'sign',
      params: { bindToken: TOKEN, chain: 'solana', kind: 'native_transfer', to: 'dest', amount: '0.01' },
    });
    const send = await handleAgentRequest(box.deps, {
      id: 'p2',
      method: 'send',
      params: { bindToken: TOKEN, chain: 'base', network: 'testnet', kind: 'native_transfer', to: '0xabc', amount: '1' },
    });
    const message = await handleAgentRequest(box.deps, {
      id: 'p3',
      method: 'sign_message',
      params: { bindToken: TOKEN, chain: 'solana', network: 'devnet', message: 'hello' },
    });
    assert.equal(sign.ok, false);
    assert.equal(send.ok, false);
    assert.equal(message.ok, false);
    if (!sign.ok) assert.equal(sign.code, 'paused');
    if (!message.ok) assert.equal(message.code, 'paused');
    assert.equal(box.signed.length, 0);
    assert.equal(messages, 0);
  });
});
