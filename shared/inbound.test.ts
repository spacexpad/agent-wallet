import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { classifyInbound, messageInbound } from './inbound.ts';

const TOKEN = `spx_bind_${'ab'.repeat(24)}`;
const CHALLENGE = 'AgentPad Solana Gate Auth\nWallet: abc\nNonce: 1\nExpires: 2';

describe('request classification', () => {
  it('keeps an explicit sign_message off the transaction shape', () => {
    const inbound = messageInbound('m1', {
      bindToken: TOKEN,
      chain: 'solana',
      network: 'devnet',
      message: CHALLENGE,
      encoding: 'utf8',
    });
    assert.equal(inbound.method, 'sign_message');
    if (inbound.method !== 'sign_message') return;
    assert.equal(inbound.params.message, CHALLENGE);
    assert.equal(inbound.params.encoding, 'utf8');
    assert.equal('serialized' in inbound.params, false);
    assert.equal('kind' in inbound.params, false);
  });

  it('reclassifies a sign or send that has message bytes and no transaction', () => {
    for (const method of ['sign', 'send'] as const) {
      const inbound = classifyInbound({
        id: method,
        method,
        params: { bindToken: TOKEN, chain: 'solana', network: 'devnet', message: CHALLENGE, encoding: 'utf8' },
      });
      assert.equal(inbound.method, 'sign_message');
    }
  });

  it('leaves a real serialized transaction on the sign path', () => {
    const inbound = classifyInbound({
      id: 'tx',
      method: 'sign',
      params: {
        bindToken: TOKEN,
        chain: 'solana',
        network: 'devnet',
        kind: 'serialized',
        serialized: 'AQID',
        message: CHALLENGE,
      },
    });
    assert.equal(inbound.method, 'sign');
    if (inbound.method !== 'sign') return;
    assert.equal(inbound.params.serialized, 'AQID');
  });
});
