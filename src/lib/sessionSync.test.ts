import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  AUTH_CHANGED,
  completeEmailLogin,
  endVaultSession,
  isAuthChangedMessage,
  shouldResyncOffscreen,
} from './sessionSync.ts';
import { waitForSolanaWallet } from './walletReady.ts';

const ADDRESS = 'CEm4PnMt2kk7uLh84FrsSzwVpBqTKtAnKxzRdwJMZjJf';

describe('offscreen session alignment', () => {
  it('notifies the offscreen document after email login so it can load the same wallet', async () => {
    let loggedIn = false;
    let reloaded = false;
    let offscreenWallets: string[] = [];
    await completeEmailLogin(
      async () => {
        loggedIn = true;
      },
      '424242',
      async () => {
        assert.equal(loggedIn, true);
        assert.equal(isAuthChangedMessage({ type: AUTH_CHANGED }), true);
        reloaded = true;
        offscreenWallets = [ADDRESS];
      },
    );
    assert.equal(reloaded, true);
    const seen = await waitForSolanaWallet(() => offscreenWallets[0], {
      timeoutMs: 0,
      sleep: async () => undefined,
      now: () => 0,
    });
    assert.equal(seen, ADDRESS);
  });

  it('does not notify offscreen when the email code is rejected', async () => {
    let notified = false;
    await assert.rejects(
      () =>
        completeEmailLogin(
          async () => {
            throw new Error('bad code');
          },
          '000000',
          async () => {
            notified = true;
          },
        ),
      /bad code/,
    );
    assert.equal(notified, false);
  });

  it('reloads offscreen after logout so it drops the previous user', async () => {
    const sent: string[] = [];
    let ended = false;
    await endVaultSession(
      async () => {
        ended = true;
      },
      async () => {
        assert.equal(ended, true);
        sent.push(AUTH_CHANGED);
      },
    );
    assert.deepEqual(sent, [AUTH_CHANGED]);
  });

  it('resyncs a ready offscreen provider that still has no Solana wallet', () => {
    assert.equal(
      shouldResyncOffscreen({
        storedSolana: ADDRESS,
        storedUserId: 'user-1',
        privyReady: true,
        solanaWalletCount: 0,
        alreadyResyncedUserId: null,
      }),
      true,
    );
    assert.equal(
      shouldResyncOffscreen({
        storedSolana: ADDRESS,
        storedUserId: 'user-1',
        privyReady: true,
        solanaWalletCount: 1,
        alreadyResyncedUserId: null,
      }),
      false,
    );
    assert.equal(
      shouldResyncOffscreen({
        storedSolana: ADDRESS,
        storedUserId: 'user-1',
        privyReady: false,
        solanaWalletCount: 0,
        alreadyResyncedUserId: null,
      }),
      false,
    );
    assert.equal(
      shouldResyncOffscreen({
        storedSolana: ADDRESS,
        storedUserId: 'user-1',
        privyReady: true,
        solanaWalletCount: 0,
        alreadyResyncedUserId: 'user-1',
      }),
      false,
    );
  });
});

describe('solana wallet hydration', () => {
  it('waits for the wallet instead of failing on the first empty read', async () => {
    let time = 0;
    let reads = 0;
    const sleeps: number[] = [];
    const wallet = await waitForSolanaWallet(
      () => {
        reads += 1;
        return reads < 3 ? undefined : { address: ADDRESS };
      },
      {
        timeoutMs: 500,
        intervalMs: 25,
        now: () => time,
        sleep: async (ms) => {
          sleeps.push(ms);
          time += ms;
        },
      },
    );
    assert.equal(reads, 3);
    assert.deepEqual(sleeps, [25, 25]);
    assert.equal(wallet.address, ADDRESS);
  });

  it('still errors when no Solana wallet appears', async () => {
    let time = 0;
    const sleeps: number[] = [];
    await assert.rejects(
      () =>
        waitForSolanaWallet(() => undefined, {
          timeoutMs: 40,
          intervalMs: 20,
          now: () => time,
          sleep: async (ms) => {
            sleeps.push(ms);
            time += ms;
          },
        }),
      /No Solana wallet is available\./,
    );
    assert.equal(sleeps.length > 0, true);
  });
});
