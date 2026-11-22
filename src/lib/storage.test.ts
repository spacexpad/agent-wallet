import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DEFAULT_RPCS, SOLANA_BROWSER_MAINNET_RPC, clusterRpcUrl } from '../../shared/chains.ts';
import { normalizeStore } from '../../shared/store.ts';
import { applyConfigHydration } from './storage.ts';

const LABS = 'https://api.mainnet-beta.solana.com';
const USER_BASE = 'https://rpc.example/user-base';
const USER_ETH = 'https://rpc.example/user-eth';

describe('config hydration keeps rpc overrides', () => {
  it('applies packed config on first hydrate and lets a stored override win for one cluster', () => {
    const fresh = normalizeStore({
      settings: {
        hydrated: false,
        rpcOverrides: {
          'base:mainnet': ` ${USER_BASE}/ `,
          'ethereum:mainnet': '   ',
        },
      },
    });
    const next = applyConfigHydration(
      fresh,
      {
        rpc: {
          'solana:mainnet': LABS,
          'base:mainnet': 'https://base-rpc.publicnode.com',
          'ethereum:mainnet': '',
        },
      },
      null,
    );
    assert.equal(next.settings.hydrated, true);
    assert.equal(next.settings.rpc['solana:mainnet'], LABS);
    assert.equal(next.settings.rpc['base:mainnet'], 'https://base-rpc.publicnode.com');
    assert.equal(next.settings.rpc['ethereum:mainnet'], DEFAULT_RPCS['ethereum:mainnet']);
    assert.equal(next.settings.rpcOverrides['base:mainnet'], USER_BASE);
    assert.equal(next.settings.rpcOverrides['ethereum:mainnet'], undefined);
    assert.equal(clusterRpcUrl(next.settings, 'base', 'mainnet'), USER_BASE);
    assert.equal(clusterRpcUrl(next.settings, 'solana', 'mainnet'), SOLANA_BROWSER_MAINNET_RPC);
    assert.equal(clusterRpcUrl(next.settings, 'ethereum', 'mainnet'), DEFAULT_RPCS['ethereum:mainnet']);
    assert.equal(clusterRpcUrl(next.settings, 'bnb', 'mainnet'), DEFAULT_RPCS['bnb:mainnet']);
  });

  it('keeps overrides after a later hydrate refreshes nothing in the packed map', () => {
    const stored = normalizeStore({
      settings: {
        hydrated: true,
        rpc: { 'ethereum:mainnet': 'https://rpc.example/packed-eth', 'solana:mainnet': LABS },
        rpcOverrides: { 'base:mainnet': USER_BASE, 'solana:mainnet': '   ' },
      },
    });
    const again = applyConfigHydration(
      stored,
      {
        rpc: {
          'ethereum:mainnet': DEFAULT_RPCS['ethereum:mainnet'],
          'base:mainnet': DEFAULT_RPCS['base:mainnet'],
          'solana:mainnet': DEFAULT_RPCS['solana:mainnet'],
        },
      },
      'ignored once hydrated',
    );
    assert.equal(again.settings.rpc['ethereum:mainnet'], 'https://rpc.example/packed-eth');
    assert.equal(again.settings.rpc['solana:mainnet'], LABS);
    assert.equal(again.settings.rpcOverrides['base:mainnet'], USER_BASE);
    assert.equal(again.settings.rpcOverrides['solana:mainnet'], undefined);
    assert.equal(clusterRpcUrl(again.settings, 'base', 'mainnet'), USER_BASE);
    assert.equal(clusterRpcUrl(again.settings, 'ethereum', 'mainnet'), 'https://rpc.example/packed-eth');
    assert.equal(clusterRpcUrl(again.settings, 'solana', 'mainnet'), SOLANA_BROWSER_MAINNET_RPC);
    assert.equal(clusterRpcUrl(again.settings, 'ethereum', 'testnet'), DEFAULT_RPCS['ethereum:testnet']);
    assert.equal(again.settings.configError, null);
  });

  it('uses a user Solana URL after hydrate instead of the public-node rewrite', () => {
    const stored = normalizeStore({
      settings: {
        hydrated: true,
        rpcOverrides: { 'solana:mainnet': LABS, 'ethereum:mainnet': USER_ETH },
      },
    });
    const again = applyConfigHydration(stored, { rpc: { 'solana:mainnet': SOLANA_BROWSER_MAINNET_RPC } }, null);
    assert.equal(clusterRpcUrl(again.settings, 'solana', 'mainnet'), LABS);
    assert.equal(clusterRpcUrl(again.settings, 'ethereum', 'mainnet'), USER_ETH);
    assert.equal(clusterRpcUrl(again.settings, 'base', 'mainnet'), DEFAULT_RPCS['base:mainnet']);
  });
});
