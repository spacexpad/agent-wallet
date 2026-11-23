import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  clearOAuthCallback,
  findAuthWindowId,
  handoffGoogleSession,
  oauthCallbackFromSearch,
  oauthFlowError,
  openGoogleAuthWindow,
  planAuthWindow,
  rememberOAuthCallback,
  shouldStartGoogleOAuth,
  type KeyValueStore,
} from './googleAuth.ts';

const AUTH = 'chrome-extension://kgjgdglopjkfahcipgkpnnkenjnoineo/auth.html';
const CALLBACK = '?privy_oauth_code=code-1&privy_oauth_state=state-1&privy_oauth_provider=google';

function memory(): KeyValueStore {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
    removeItem: (key) => {
      values.delete(key);
    },
  };
}

describe('google auth window', () => {
  it('does not start a second OAuth flow when the auth window reloads on the callback', () => {
    const storage = memory();
    assert.equal(oauthCallbackFromSearch(CALLBACK), true);
    assert.equal(rememberOAuthCallback(CALLBACK, storage), true);
    assert.equal(
      shouldStartGoogleOAuth({ ready: true, authenticated: false, callbackPending: true, alreadyStarted: false }),
      false,
    );
    assert.equal(rememberOAuthCallback('', storage), true);
    assert.equal(
      shouldStartGoogleOAuth({
        ready: true,
        authenticated: false,
        callbackPending: rememberOAuthCallback('', storage),
        alreadyStarted: false,
      }),
      false,
    );
    assert.equal(shouldStartGoogleOAuth({ ready: false, authenticated: false, callbackPending: false, alreadyStarted: false }), false);
    assert.equal(shouldStartGoogleOAuth({ ready: true, authenticated: true, callbackPending: false, alreadyStarted: false }), false);
    assert.equal(shouldStartGoogleOAuth({ ready: true, authenticated: false, callbackPending: false, alreadyStarted: true }), false);
  });

  it('starts OAuth once for a fresh auth window', () => {
    const storage = memory();
    assert.equal(oauthCallbackFromSearch(''), false);
    assert.equal(oauthCallbackFromSearch('?privy_oauth_code=only-code'), false);
    assert.equal(rememberOAuthCallback('', storage), false);
    assert.equal(shouldStartGoogleOAuth({ ready: true, authenticated: false, callbackPending: false, alreadyStarted: false }), true);
    clearOAuthCallback(storage);
    assert.equal(rememberOAuthCallback('', storage), false);
  });

  it('focuses the existing auth window instead of opening another login window', () => {
    const contexts = [
      { documentUrl: 'chrome-extension://kgjgdglopjkfahcipgkpnnkenjnoineo/popup.html', windowId: 4 },
      { documentUrl: `${AUTH}${CALLBACK}`, windowId: 9 },
    ];
    assert.equal(findAuthWindowId(contexts, AUTH), 9);
    assert.deepEqual(planAuthWindow(contexts, AUTH), { action: 'focus', windowId: 9 });
    assert.deepEqual(planAuthWindow([{ documentUrl: 'chrome-extension://id/offscreen.html', windowId: 3 }], AUTH), { action: 'open' });
    assert.equal(findAuthWindowId([{ documentUrl: AUTH, windowId: -1 }], AUTH), null);
  });

  it('does not open a second auth window while the first open is still in flight', async () => {
    const lock = { current: null };
    let opened = 0;
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const deps = {
      authUrl: AUTH,
      contexts: async () => [],
      focus: async () => undefined,
      open: async () => {
        opened += 1;
        await gate;
      },
    };
    const first = openGoogleAuthWindow(lock, deps);
    const second = openGoogleAuthWindow(lock, deps);
    release();
    await first;
    await second;
    assert.equal(opened, 1);
  });

  it('publishes the session and leaves the auth window up when the toolbar popup cannot reopen', async () => {
    const stayed: string[] = [];
    const stay = await handoffGoogleSession({
      notify: async () => {
        stayed.push('notify');
      },
      openPopup: async () => {
        stayed.push('popup');
        throw new Error('This function must be called during a user gesture');
      },
      close: () => {
        stayed.push('close');
      },
    });
    assert.equal(stay, 'stay');
    assert.deepEqual(stayed, ['notify', 'popup']);

    const opened: string[] = [];
    const popup = await handoffGoogleSession({
      notify: async () => {
        opened.push('notify');
      },
      openPopup: async () => {
        opened.push('popup');
      },
      close: () => {
        opened.push('close');
      },
    });
    assert.equal(popup, 'popup');
    assert.deepEqual(opened, ['notify', 'popup', 'close']);
  });

  it('surfaces an OAuth flow error without inventing one for a clean start', () => {
    assert.equal(oauthFlowError({ status: 'loading' }, 'Google sign-in did not finish.'), null);
    assert.equal(oauthFlowError({ status: 'error', error: null }, 'Google sign-in did not finish.'), 'Google sign-in did not finish.');
    assert.equal(
      oauthFlowError({ status: 'error', error: { message: 'Unexpected auth flow. This may be a phishing attempt.' } }, 'fallback'),
      'Unexpected auth flow. This may be a phishing attempt.',
    );
  });
});
