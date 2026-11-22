import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fallbackToExtension } from './authRoute.ts';

describe('authorization routing', () => {
  it('does not fall back to the extension for revoked, paused, or policy blocks', () => {
    assert.equal(fallbackToExtension('revoked', false), false);
    assert.equal(fallbackToExtension('paused', false), false);
    assert.equal(fallbackToExtension('unbound', false), false);
    assert.equal(fallbackToExtension('limit', false), false);
    assert.equal(fallbackToExtension('whitelist', false), false);
  });

  it('falls back when the grant is missing or the service cannot be reached', () => {
    assert.equal(fallbackToExtension('not-granted', false), true);
    assert.equal(fallbackToExtension(undefined, true), true);
  });
});
