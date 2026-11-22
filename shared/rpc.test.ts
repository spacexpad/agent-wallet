import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  DEFAULT_RPCS,
  SOLANA_BROWSER_MAINNET_RPC,
  clusterRpcUrl,
  parseRpcOverride,
  rpcOriginPattern,
} from './chains.ts';
import { normalizeStore } from './store.ts';

const LABS = 'https://api.mainnet-beta.solana.com';
const USER_ETH = 'https://rpc.example/eth';
const USER_BASE = 'https://rpc.example/base';

describe('rpc overrides', () => {
  it('uses a user URL for that cluster and the public default for the rest', () => {
    const settings = {
      rpc: { ...DEFAULT_RPCS, 'solana:mainnet': LABS },
      rpcOverrides: {
        'ethereum:mainnet': `  ${USER_ETH}/  `,
        'base:mainnet': '   ',
        'solana:devnet': '',
      },
    };
    assert.equal(clusterRpcUrl(settings, 'ethereum', 'mainnet'), USER_ETH);
    assert.equal(clusterRpcUrl(settings, 'base', 'mainnet'), DEFAULT_RPCS['base:mainnet']);
    assert.equal(clusterRpcUrl(settings, 'solana', 'devnet'), DEFAULT_RPCS['solana:devnet']);
    assert.equal(clusterRpcUrl(settings, 'bnb', 'mainnet'), DEFAULT_RPCS['bnb:mainnet']);
    assert.equal(clusterRpcUrl(settings, 'solana', 'mainnet'), SOLANA_BROWSER_MAINNET_RPC);
  });

  it('keeps a user-supplied Solana Labs URL and still rewrites that URL on the public path', () => {
    assert.equal(
      clusterRpcUrl({ rpc: { 'solana:mainnet': LABS }, rpcOverrides: { 'solana:mainnet': `${LABS}/` } }, 'solana', 'mainnet'),
      LABS,
    );
    assert.equal(clusterRpcUrl({ rpc: { 'solana:mainnet': `${LABS}/` }, rpcOverrides: { 'solana:mainnet': '  ' } }, 'solana', 'mainnet'), SOLANA_BROWSER_MAINNET_RPC);
    assert.equal(clusterRpcUrl({ rpc: { 'solana:mainnet': LABS } }, 'solana', 'mainnet'), SOLANA_BROWSER_MAINNET_RPC);
  });

  it('does not read the popup network view', () => {
    const settings = {
      rpc: { ...DEFAULT_RPCS },
      rpcOverrides: { 'solana:devnet': 'https://rpc.example/sol-dev' },
    };
    assert.equal(clusterRpcUrl(settings, 'solana', 'mainnet'), SOLANA_BROWSER_MAINNET_RPC);
    assert.equal(clusterRpcUrl(settings, 'solana', 'devnet'), 'https://rpc.example/sol-dev');
  });

  it('rejects obvious garbage and accepts https plus loopback http', () => {
    assert.deepEqual(parseRpcOverride('   '), { ok: true, url: '' });
    const query = parseRpcOverride('https://rpc.example/sol?x=1');
    assert.equal(query.ok, true);
    if (query.ok) assert.equal(query.url, 'https://rpc.example/sol?x=1');
    assert.deepEqual(parseRpcOverride('http://127.0.0.1:8899'), { ok: true, url: 'http://127.0.0.1:8899' });
    assert.deepEqual(parseRpcOverride('http://localhost:8545/'), { ok: true, url: 'http://localhost:8545' });
    assert.deepEqual(parseRpcOverride('http://[::1]:8899'), { ok: true, url: 'http://[::1]:8899' });
    assert.equal(parseRpcOverride('not a url').ok, false);
    assert.equal(parseRpcOverride('ftp://rpc.example/sol').ok, false);
    assert.equal(parseRpcOverride('http://rpc.example/sol').ok, false);
    assert.equal(parseRpcOverride(`${'java'}${'script:alert(1)'}`).ok, false);
    assert.equal(parseRpcOverride('https://rpc.example/sol ana').ok, false);
  });

  it('builds a host permission without the path or query', () => {
    assert.equal(rpcOriginPattern('https://user:pass@rpc.example/sol?x=1'), 'https://rpc.example/*');
    assert.equal(rpcOriginPattern('http://127.0.0.1:8899'), 'http://127.0.0.1/*');
    assert.equal(rpcOriginPattern('http://[::1]:8899'), 'http://[::1]/*');
    assert.equal(rpcOriginPattern('   '), null);
    assert.equal(rpcOriginPattern('ftp://rpc.example'), null);
  });

  it('stores only non-empty overrides and fills blank packed keys from the public defaults', () => {
    const store = normalizeStore({
      settings: {
        rpc: { 'solana:mainnet': '   ', 'ethereum:mainnet': USER_ETH },
        rpcOverrides: {
          'base:mainnet': ` ${USER_BASE}/ `,
          'ethereum:testnet': '   ',
          'nope:mainnet': 'https://rpc.example/nope',
          'bnb:mainnet': 12,
        },
      },
    });
    assert.equal(store.settings.rpc['solana:mainnet'], DEFAULT_RPCS['solana:mainnet']);
    assert.equal(store.settings.rpc['ethereum:mainnet'], USER_ETH);
    assert.equal(store.settings.rpcOverrides['base:mainnet'], USER_BASE);
    assert.equal(store.settings.rpcOverrides['ethereum:testnet'], undefined);
    assert.equal(store.settings.rpcOverrides['nope:mainnet'], undefined);
    assert.equal(store.settings.rpcOverrides['bnb:mainnet'], undefined);
    assert.equal(clusterRpcUrl(store.settings, 'base', 'mainnet'), USER_BASE);
    assert.equal(clusterRpcUrl(store.settings, 'ethereum', 'mainnet'), USER_ETH);
    assert.equal(clusterRpcUrl(store.settings, 'solana', 'mainnet'), SOLANA_BROWSER_MAINNET_RPC);
    assert.equal(clusterRpcUrl(store.settings, 'bnb', 'testnet'), DEFAULT_RPCS['bnb:testnet']);
  });
});
