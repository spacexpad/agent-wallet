import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';
import nacl from 'tweetnacl';
import { NEEDS_CONFIRMATION } from './offlinePolicy.ts';
import { emptyAuthState, handleAuthRequest } from './offlineHttp.ts';
import type { PrivyOffline } from './offlineLedger.ts';
import { authorizationPayload, canonicalize, derFromP1363, signAuthorizationPayload, solanaMessageRpc } from './privyAuth.ts';
import { messageBytes, signatureBase58 } from './message.ts';

const OWNER = 'owner-key-not-a-privy-secret';
const ADDRESS = 'CEm4PnMt2kk7uLh84FrsSzwVpBqTKtAnKxzRdwJMZjJf';
const MESSAGE = 'AgentPad Solana Gate Auth\nWallet: abc\nNonce: 1\nExpires: 2';

function privyFor(pair: nacl.SignKeyPair, calls: string[]): PrivyOffline {
  return {
    async signMessage(input) {
      calls.push('signMessage');
      assert.deepEqual([...input.message], [...messageBytes(MESSAGE, 'utf8')]);
      return { signature: nacl.sign.detached(input.message, pair.secretKey) };
    },
    async signTransaction() {
      calls.push('signTransaction');
      return { signedTransaction: 'signed-offline' };
    },
    async sendTransaction() {
      calls.push('sendTransaction');
      return { hash: 'offline-hash', signedTransaction: 'signed-offline' };
    },
  };
}

async function boot(privy: PrivyOffline) {
  let state = emptyAuthState();
  const now = Date.parse('2026-11-22T00:00:00Z');
  const deps = { now: () => now, privy };
  const steps: Array<[string, unknown]> = [
    ['/v1/pair/register', { pairCode: 'ABCD2345', expiresAt: now + 60_000, ownerKey: OWNER }],
    ['/v1/pair/issue', { pairCode: 'ABCD2345', agentName: 'Claude' }],
  ];
  let token = '';
  for (const [path, body] of steps) {
    const outcome = await handleAuthRequest(state, new Request(`https://auth.example${path}`, { method: 'POST', body: JSON.stringify(body) }), deps);
    state = outcome.state;
    if (path === '/v1/pair/issue') token = ((await outcome.response.json()) as { bindToken: string }).bindToken;
  }
  const redeemed = await handleAuthRequest(
    state,
    new Request('https://auth.example/v1/pair/redeem', {
      method: 'POST',
      body: JSON.stringify({ pairCode: 'ABCD2345', bindToken: token, ownerKey: OWNER }),
    }),
    deps,
  );
  state = redeemed.state;
  const policy = await handleAuthRequest(
    state,
    new Request('https://auth.example/v1/policy', {
      method: 'POST',
      body: JSON.stringify({ ownerKey: OWNER, paused: false, whitelist: [], fullAccess: true, whitelistEnabled: false }),
    }),
    deps,
  );
  state = policy.state;
  const granted = await handleAuthRequest(
    state,
    new Request('https://auth.example/v1/grant', {
      method: 'POST',
      body: JSON.stringify({
        ownerKey: OWNER,
        bindToken: token,
        userId: 'user-1',
        solanaAddress: ADDRESS,
        solanaWalletId: 'wallet-sol',
        evmAddress: '0x1111111111111111111111111111111111111111',
        evmWalletId: 'wallet-evm',
      }),
    }),
    deps,
  );
  return { state: granted.state, token, deps };
}

describe('offline authorization', () => {
  it('signs a challenge for a granted agent without an extension session', async () => {
    const pair = nacl.sign.keyPair();
    const calls: string[] = [];
    const ready = await boot(privyFor(pair, calls));
    const outcome = await handleAuthRequest(
      ready.state,
      new Request('https://auth.example/v1/sign-message', {
        method: 'POST',
        headers: { authorization: `Bearer ${ready.token}` },
        body: JSON.stringify({ message: MESSAGE, encoding: 'utf8' }),
      }),
      ready.deps,
    );
    const body = (await outcome.response.json()) as { ok: boolean; result: { signature: string; signatureBase58: string; publicKey: string } };
    assert.equal(body.ok, true);
    assert.deepEqual(calls, ['signMessage']);
    assert.equal(body.result.publicKey, ADDRESS);
    const raw = Uint8Array.from(Buffer.from(body.result.signature, 'base64'));
    assert.equal(nacl.sign.detached.verify(messageBytes(MESSAGE, 'utf8'), raw, pair.publicKey), true);
    assert.equal(body.result.signatureBase58, signatureBase58(raw));
  });

  it('sends under full access without a whitelist or a native cap', async () => {
    const pair = nacl.sign.keyPair();
    const calls: string[] = [];
    const ready = await boot(privyFor(pair, calls));
    const outcome = await handleAuthRequest(
      ready.state,
      new Request('https://auth.example/v1/send-transaction', {
        method: 'POST',
        headers: { authorization: `Bearer ${ready.token}` },
        body: JSON.stringify({ chain: 'solana', kind: 'serialized', to: 'not-listed', amount: '5', serialized: 'AQID' }),
      }),
      ready.deps,
    );
    const body = (await outcome.response.json()) as { ok: boolean; result: { hash: string; status: string } };
    assert.equal(body.ok, true);
    assert.equal(body.result.hash, 'offline-hash');
    assert.equal(body.result.status, 'submitted');
    assert.deepEqual(calls, ['sendTransaction']);
  });

  it('rejects unbound, revoked, and paused agents before Privy is called', async () => {
    const pair = nacl.sign.keyPair();
    const calls: string[] = [];
    const ready = await boot(privyFor(pair, calls));
    const unknown = await handleAuthRequest(
      ready.state,
      new Request('https://auth.example/v1/sign-message', {
        method: 'POST',
        headers: { authorization: 'Bearer spx_bind_' + 'cd'.repeat(24) },
        body: JSON.stringify({ message: 'nope' }),
      }),
      ready.deps,
    );
    const unknownBody = (await unknown.response.json()) as { ok: boolean; code?: string };
    assert.equal(unknownBody.ok, false);
    assert.equal(unknownBody.code, 'unbound');

    const paused = await handleAuthRequest(
      ready.state,
      new Request('https://auth.example/v1/policy', { method: 'POST', body: JSON.stringify({ ownerKey: OWNER, paused: true, whitelist: ['dest-ok'] }) }),
      ready.deps,
    );
    const pausedSign = await handleAuthRequest(
      paused.state,
      new Request('https://auth.example/v1/sign-message', {
        method: 'POST',
        headers: { authorization: `Bearer ${ready.token}` },
        body: JSON.stringify({ message: MESSAGE }),
      }),
      ready.deps,
    );
    const pausedBody = (await pausedSign.response.json()) as { code?: string };
    assert.equal(pausedBody.code, 'paused');

    const resumed = await handleAuthRequest(
      paused.state,
      new Request('https://auth.example/v1/policy', { method: 'POST', body: JSON.stringify({ ownerKey: OWNER, paused: false, whitelist: ['dest-ok'] }) }),
      ready.deps,
    );
    const revoked = await handleAuthRequest(
      resumed.state,
      new Request('https://auth.example/v1/revoke', { method: 'POST', body: JSON.stringify({ ownerKey: OWNER, bindToken: ready.token }) }),
      ready.deps,
    );
    const revokedSign = await handleAuthRequest(
      revoked.state,
      new Request('https://auth.example/v1/send-transaction', {
        method: 'POST',
        headers: { authorization: `Bearer ${ready.token}` },
        body: JSON.stringify({ chain: 'solana', kind: 'serialized', to: 'dest-ok', amount: '5', serialized: 'AQID' }),
      }),
      ready.deps,
    );
    const revokedBody = (await revokedSign.response.json()) as { code?: string };
    assert.equal(revokedBody.code, 'revoked');
    assert.deepEqual(calls, []);
  });

  it('rejects offline requests only after the user tightens the policy', async () => {
    const pair = nacl.sign.keyPair();
    const calls: string[] = [];
    const ready = await boot(privyFor(pair, calls));
    const limited = await handleAuthRequest(
      ready.state,
      new Request('https://auth.example/v1/policy', {
        method: 'POST',
        body: JSON.stringify({
          ownerKey: OWNER,
          paused: false,
          whitelist: ['dest-ok'],
          whitelistEnabled: false,
          fullAccess: false,
          maxNative: { solana: '0.05' },
        }),
      }),
      ready.deps,
    );
    const rich = await handleAuthRequest(
      limited.state,
      new Request('https://auth.example/v1/send-transaction', {
        method: 'POST',
        headers: { authorization: `Bearer ${ready.token}` },
        body: JSON.stringify({ chain: 'solana', kind: 'serialized', to: 'dest-ok', amount: '2', serialized: 'AQID' }),
      }),
      ready.deps,
    );
    const richBody = (await rich.response.json()) as { error?: string; code?: string };
    assert.equal(richBody.error, NEEDS_CONFIRMATION);
    assert.equal(richBody.code, 'limit');
    const listed = await handleAuthRequest(
      limited.state,
      new Request('https://auth.example/v1/policy', {
        method: 'POST',
        body: JSON.stringify({
          ownerKey: OWNER,
          paused: false,
          whitelist: ['dest-ok'],
          whitelistEnabled: true,
          fullAccess: true,
        }),
      }),
      ready.deps,
    );
    const stranger = await handleAuthRequest(
      listed.state,
      new Request('https://auth.example/v1/sign-transaction', {
        method: 'POST',
        headers: { authorization: `Bearer ${ready.token}` },
        body: JSON.stringify({ chain: 'solana', kind: 'serialized', to: 'other', amount: '0.01', serialized: 'AQID' }),
      }),
      ready.deps,
    );
    const strangerBody = (await stranger.response.json()) as { error?: string; code?: string };
    assert.equal(strangerBody.error, NEEDS_CONFIRMATION);
    assert.equal(strangerBody.code, 'whitelist');
    assert.deepEqual(calls, []);
  });

  it('keeps Privy key material out of the skill text and extension sources', async () => {
    const files = [
      'docs/agent-wallet/skill.md',
      'skill/spacexpad-agent-wallet/SKILL.md',
      'src/popup/App.tsx',
      'src/offscreen/main.tsx',
      'src/privy/useVault.tsx',
      'config.example.json',
    ];
    const banned = ['BEGIN PRIVATE KEY', 'BEGIN EC PRIVATE KEY', 'PRIVY_APP_SECRET=', 'wallet-auth:'];
    for (const file of files) {
      const text = await readFile(file, 'utf8');
      for (const token of banned) assert.equal(text.includes(token), false, `${file} contains ${token}`);
    }
  });
});

describe('privy authorization payload', () => {
  it('canonicalizes and signs with a generated P-256 key', async () => {
    const key = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
    const pkcs8 = new Uint8Array(await crypto.subtle.exportKey('pkcs8', key.privateKey));
    const body = solanaMessageRpc(messageBytes('hi', 'utf8'));
    const payload = authorizationPayload({ url: 'https://api.privy.io/v1/wallets/wallet-sol/rpc', body, appId: 'app-id' });
    const serialized = canonicalize(payload);
    assert.equal(serialized.includes(' '), false);
    const signature = await signAuthorizationPayload(pkcs8, serialized);
    const raw = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key.privateKey, new TextEncoder().encode(serialized)));
    const der = derFromP1363(raw);
    const back = p1363FromDer(der);
    const payloadBytes = bytesOf(new TextEncoder().encode(serialized));
    const verified = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key.publicKey, bytesOf(back), payloadBytes);
    assert.equal(verified, true);
    assert.equal(signature.length > 0, true);
  });
});

function bytesOf(value: Uint8Array): ArrayBuffer {
  const copy = new ArrayBuffer(value.byteLength);
  new Uint8Array(copy).set(value);
  return copy;
}

function p1363FromDer(der: Uint8Array): Uint8Array {
  const rLen = der[3];
  const r = der.slice(4, 4 + rLen);
  const sLen = der[4 + rLen + 1];
  const s = der.slice(4 + rLen + 2, 4 + rLen + 2 + sLen);
  const out = new Uint8Array(64);
  out.set(r.slice(-32), 32 - Math.min(32, r.length));
  out.set(s.slice(-32), 64 - Math.min(32, s.length));
  return out;
}
