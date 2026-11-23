import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('source manifest stays Manifest V3 and pins the unpacked id', async () => {
  const manifest = JSON.parse(await readFile(new URL('../public/manifest.json', import.meta.url), 'utf8'));
  const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.version, '0.1.1');
  assert.equal(pkg.version, manifest.version);
  assert.ok(String(manifest.key).startsWith('MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAx2Jdh'));
  assert.deepEqual(manifest.permissions, ['storage', 'identity', 'offscreen', 'alarms', 'clipboardWrite']);
  assert.equal(manifest.permissions.includes('tabs'), false);
  assert.equal(manifest.permissions.includes('history'), false);
  assert.equal(manifest.content_scripts, undefined);
  const hosts = manifest.host_permissions as string[];
  assert.equal(hosts.includes('https://spacexpad-agent-wallet-auth.timmy2048.workers.dev/*'), true);
  assert.equal(hosts.some((host) => host.includes('*.workers.dev')), false);
  assert.equal(hosts.includes('<all_urls>'), false);
  assert.equal(hosts.includes('https://bsc.blockscout.com/*'), false);
  assert.equal(hosts.includes('https://api.mainnet-beta.solana.com/*'), false);
  assert.deepEqual(manifest.optional_host_permissions, ['https://*/*', 'http://localhost/*', 'http://127.0.0.1/*', 'http://[::1]/*']);
});
