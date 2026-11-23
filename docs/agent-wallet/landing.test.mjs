import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');

function read(path) {
  return readFileSync(join(root, path));
}

const protectedHashes = {
  'docs/agent-wallet/privacy.html': 'cac2a012312ebb4248657e3190ebb644bec48e844053491609e2b88efe83b794',
  'docs/agent-wallet/skill.md': 'b86fa2e00002c583ed8eb55c763a846f42cad96881aa421863773f12e655083b',
  'PRIVACY.md': 'f0a61b567f7b877e1517bdfcd7f5d9f9416c0f307b229c05a86575382a201656',
  'skill/spacexpad-agent-wallet/SKILL.md': '46b50af3fa57a8163b9217aee06c9037c678493ff261158257bfd54601507f20',
  'public/manifest.json': '1410f55aed9361437fcee1e96c5c9df88126b48206e55952b91d591fad607adb',
  'DESIGN.md': '2d28ec11c607f86d8365c8d0fab76280fa36db749d4aaa3c7ea87a0cab8437da',
  'CHROMEWEBSTORE.md': '3a37be4e1b54b5b62ceb3e76901af5754913ac8c8ba177cd6cb1da417ba6913e',
};

function sha(path) {
  return createHash('sha256').update(read(path)).digest('hex');
}

test('protected wallet and launchpad-facing sources are unchanged', () => {
  for (const [path, hash] of Object.entries(protectedHashes)) {
    assert.equal(sha(path), hash, path);
  }
  const pkg = JSON.parse(read('package.json', 'utf8'));
  const before = JSON.parse(execSync('git show origin/main:package.json', { encoding: 'utf8', cwd: root }));
  assert.equal(pkg.version, '0.1.1');
  const { test: afterTest, ...afterScripts } = pkg.scripts;
  const { test: beforeTest, ...beforeScripts } = before.scripts;
  assert.deepEqual(afterScripts, beforeScripts);
  assert.equal(afterTest, beforeTest);
  assert.match(afterTest, /docs\/agent-wallet\/\*\*\/\*\.test\.mjs/);
  assert.deepEqual(pkg.dependencies, before.dependencies);
  assert.deepEqual(pkg.devDependencies, before.devDependencies);
});

test('the diff does not change the landing page or other protected copy', () => {
  const base = execSync('git merge-base HEAD origin/main', { encoding: 'utf8', cwd: root }).trim();
  const committed = execSync(`git diff --name-only ${base}`, { encoding: 'utf8', cwd: root })
    .split('\n')
    .filter(Boolean);
  const porcelain = execSync('git status --porcelain', { encoding: 'utf8', cwd: root })
    .split('\n')
    .filter(Boolean)
    .map((line) => line.slice(3).trim());
  const frozen = new Set([
    'docs/agent-wallet/privacy.html',
    'docs/agent-wallet/skill.md',
    'PRIVACY.md',
    'skill/spacexpad-agent-wallet/SKILL.md',
    'DESIGN.md',
    'docs/agent-wallet/index.html',
    'docs/agent-wallet/DESIGN.md',
    'docs/agent-wallet/DEPLOY.md',
  ]);
  for (const path of [...committed, ...porcelain]) {
    assert.equal(frozen.has(path), false, path);
  }
});

test('store, skill, privacy, and support links are the live ones', () => {
  const store = 'https://chromewebstore.google.com/detail/spacexpad-agent-wallet/nkbahofelgkjbagiabpcddnjjckbajep';
  assert.equal(html.split(store).length - 1, 2);
  assert.match(html, /rel="canonical" href="https:\/\/spacexpad\.xyz\/agent-wallet\/"/);
  assert.match(html, /href="https:\/\/spacexpad\.xyz\/agent-wallet\/skill\.md"/);
  assert.match(html, /href="https:\/\/spacexpad\.xyz\/agent-wallet\/privacy"/);
  assert.match(html, /href="mailto:hello@spacexpad\.xyz"/);
  assert.match(html, /nkbahofelgkjbagiabpcddnjjckbajep/);
  assert.doesNotMatch(html, /href="\/skill(?:\.md)?"/);
  assert.doesNotMatch(html, /href="\/agents"/);
  assert.doesNotMatch(html, /href="\/"/);
  assert.equal(html.includes('<script'), false);
  assert.doesNotMatch(html, /transition\s*:\s*all/);
  assert.match(html, /prefers-reduced-motion/);
  assert.match(html, /:focus-visible/);
});

test('local assets exist and the mark is the real toolbar icon', () => {
  assert.equal(sha('docs/agent-wallet/assets/mark.png'), sha('public/icons/icon-128.png'));
  const refs = [
    ...html.matchAll(/(?:href|src)="(assets\/[^"]+)"/g),
    ...html.matchAll(/url\("(assets\/[^"]+)"\)/g),
  ].map((match) => match[1]);
  assert.ok(refs.length >= 5);
  for (const ref of new Set(refs)) {
    const file = statSync(new URL(ref, import.meta.url));
    assert.equal(file.isFile(), true, ref);
  }
});

test('the page states shipped behavior and does not invent the rest', () => {
  const text = html.replace(/<[^>]+>/g, '');
  for (const phrase of [
    'SPACEXPAD_AUTH_URL',
    'https://spacexpad-agent-wallet-auth.timmy2048.workers.dev',
    'Solana',
    'Ethereum',
    'Base',
    'BNB',
    'Privy',
    'Pause all agents',
    'Resume',
    'Remove',
    'Turn off offline signing',
    'Full access',
    'Continue with Google',
    'Send code',
    'Binding token',
    'Copy prompt',
    'still on Solana devnet',
    'does not include custom RPC endpoints',
    'never asks for a seed phrase',
    'no private-key export',
  ]) {
    assert.equal(text.includes(phrase), true, phrase);
  }
  assert.equal([...html.matchAll(/<h1[\s>]/g)].length, 1);
  for (const banned of [
    'trusted by',
    'testimonial',
    'SOC 2',
    'ISO 27001',
    'users worldwide',
    '★★',
    'enter your seed',
    'export your private key',
    'launchpad is mainnet',
    'optional RPC',
  ]) {
    assert.equal(text.toLowerCase().includes(banned.toLowerCase()), false, banned);
  }
});
