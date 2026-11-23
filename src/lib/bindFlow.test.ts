import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { agentsNeedingGrant, defaultStore, walletReady } from '../../shared/store.ts';
import { redeemBindToken, registerPendingPair, runOfflineGrant } from './bindFlow.ts';
import type { Settings } from '../../shared/types.ts';

const TOKEN = `spx_bind_${'ab'.repeat(24)}`;
const ADDRESS = 'CEm4PnMt2kk7uLh84FrsSzwVpBqTKtAnKxzRdwJMZjJf';

function settings(): Settings {
  return {
    ...defaultStore().settings,
    authUrl: 'https://auth.example',
    bridgeToken: 'bridge-token',
    privyKeyQuorumId: 'quorum-1',
  };
}

describe('bind registration and redeem', () => {
  it('reports an authorization-service registration failure and does not mark the pair registered', async () => {
    const outcome = await registerPendingPair(settings(), { code: 'ABCD2345', expiresAt: 1 }, {
      registerBridge: async () => true,
      postAuth: async () => {
        throw new Error('register failed');
      },
      ensureOwnerKey: async () => 'owner-key',
    });
    assert.equal(outcome.registered, false);
    assert.equal(outcome.authError, 'register failed');
    assert.equal(outcome.bridgeError, null);
  });

  it('registers with the authorization service even when the local bridge is down', async () => {
    const calls: string[] = [];
    const outcome = await registerPendingPair(settings(), { code: 'ABCD2345', expiresAt: 1 }, {
      registerBridge: async () => {
        calls.push('bridge');
        throw new Error('The agent bridge is not running.');
      },
      postAuth: async (_settings, path) => {
        calls.push(path);
        return { ok: true };
      },
      ensureOwnerKey: async () => 'owner-key',
    });
    assert.deepEqual(calls, ['bridge', '/v1/pair/register']);
    assert.equal(outcome.registered, false);
    assert.equal(outcome.authError, null);
    assert.equal(outcome.bridgeError, null);
  });

  it('redeems on the authorization service and the local bridge', async () => {
    const calls: string[] = [];
    const body = await redeemBindToken({
      authUrl: 'https://auth.example',
      bridgeToken: 'bridge-token',
      pairCode: 'ABCD2345',
      bindToken: TOKEN,
      ownerKey: 'owner-key',
      postAuth: async (path) => {
        calls.push(`auth ${path}`);
        return { agentId: 'agent_1', agentName: 'Ada' };
      },
      postBridge: async (path) => {
        calls.push(`bridge ${path}`);
        return { agentId: 'agent_1', agentName: 'Ada' };
      },
    });
    assert.deepEqual(calls, ['auth /v1/pair/redeem', 'bridge /v1/pair/redeem']);
    assert.equal(body.agentId, 'agent_1');
  });

  it('keeps a redeemed auth binding when the local bridge does not know the token', async () => {
    for (const message of ['The agent bridge is not running.', 'That token was not recognized.']) {
      const body = await redeemBindToken({
        authUrl: 'https://auth.example',
        bridgeToken: 'bridge-token',
        pairCode: 'ABCD2345',
        bindToken: TOKEN,
        ownerKey: 'owner-key',
        postAuth: async () => ({ agentId: 'agent_1', agentName: 'Ada' }),
        postBridge: async () => {
          throw new Error(message);
        },
      });
      assert.equal(body.agentName, 'Ada');
    }
  });
});

describe('grant after redeem', () => {
  it('grants the authorization service after redeem without opening the agent tab', async () => {
    const store = {
      ...defaultStore(),
      addresses: { evm: '0x1111111111111111111111111111111111111111', solana: ADDRESS },
      auth: { userId: 'user-1', email: 'ada@example.com' },
      agents: [{ id: 'agent_1', name: 'Ada', token: TOKEN, boundAt: 1, offlineGranted: false }],
    };
    assert.equal(walletReady(store), false);
    assert.deepEqual(agentsNeedingGrant(store, { authenticated: true, solanaWalletId: 'wallet-sol' }), [TOKEN]);

    const calls: string[] = [];
    const signers: string[] = [];
    let next: ReturnType<typeof defaultStore> = store;
    await runOfflineGrant({
      store,
      token: TOKEN,
      userId: 'user-1',
      solanaAddress: ADDRESS,
      evmAddress: store.addresses.evm,
      solanaWalletId: 'wallet-sol',
      evmWalletId: 'wallet-evm',
      quorumId: 'quorum-1',
      addSigners: async ({ address }) => {
        signers.push(address);
      },
      postAuth: async (_settings, path, body) => {
        calls.push(path);
        const record = body as { bindToken?: string; solanaWalletId?: string };
        if (path === '/v1/grant') {
          assert.equal(record.bindToken, TOKEN);
          assert.equal(record.solanaWalletId, 'wallet-sol');
        }
        return { ok: true };
      },
      ensureOwnerKey: async () => 'owner-key',
      updateStore: async (patch) => {
        next = patch(next);
        return next;
      },
    });
    assert.deepEqual(calls, ['/v1/policy', '/v1/grant']);
    assert.deepEqual(signers, [ADDRESS, '0x1111111111111111111111111111111111111111']);
    assert.equal(next.agents[0]?.offlineGranted, true);
    assert.equal(walletReady(next), true);
    assert.deepEqual(agentsNeedingGrant(next, { authenticated: true, solanaWalletId: 'wallet-sol' }), []);
  });
});
