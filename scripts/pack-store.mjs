import { spawn } from 'node:child_process';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'store');
const zipPath = join(outDir, 'spacexpad-agent-wallet-0.1.0.zip');

const BLOCKED = [
  'telegram-login.js',
  'challenges.cloudflare.com',
  'js.hcaptcha.com',
  'crypto-js.stripe.com',
  'js.stripe.com',
  'issuing-key.stripe.com',
  'BEGIN PRIVATE KEY',
  'BEGIN RSA PRIVATE KEY',
  'PRIVY_APP_SECRET',
  'PRIVY_AUTHORIZATION_PRIVATE_KEY',
  'wallet-auth:',
  'CEm4PnMt2kk7uLh84FrsSzwVpBqTKtAnKxzRdwJMZjJf',
  '0x2a989ad01fE8Ff101682e364a619e56a5D4f029a',
];

const SOURCE_KEY_PREFIX = 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAx2Jdh';

await run('npm', ['run', 'build'], root);

const sourceManifest = JSON.parse(await readFile(join(root, 'public/manifest.json'), 'utf8'));
if (typeof sourceManifest.key !== 'string' || !sourceManifest.key.startsWith(SOURCE_KEY_PREFIX)) {
  throw new Error('Refusing to pack: public/manifest.json no longer has the unpacked extension key.');
}

const staging = await mkdtemp(join(tmpdir(), 'spacexpad-store-'));
try {
  await cp(join(root, 'dist'), staging, { recursive: true });
  const manifestPath = join(staging, 'manifest.json');
  const packaged = JSON.parse(await readFile(manifestPath, 'utf8'));
  delete packaged.key;
  await writeFile(manifestPath, `${JSON.stringify(packaged, null, 2)}\n`);
  await rm(zipPath, { force: true });
  await run('zip', ['-r', '-X', zipPath, '.', '-x', '*.map', '-x', '.env', '-x', '*/.env', '-x', 'CHROMEWEBSTORE.md', '-x', '.git/*', '-x', 'node_modules/*'], staging);
} finally {
  await rm(staging, { recursive: true, force: true });
}

const stillPinned = JSON.parse(await readFile(join(root, 'public/manifest.json'), 'utf8'));
if (stillPinned.key !== sourceManifest.key) {
  throw new Error('Packaging changed the source manifest key. That must never happen.');
}

const report = await scanZip(zipPath);
process.stdout.write(`${report}\n`);
if (report.includes('\nFAIL ')) {
  throw new Error('Store zip failed the review scan. See the report above.');
}

function run(command, args, cwd) {
  return new Promise((done, reject) => {
    const child = spawn(command, args, { cwd, stdio: 'inherit' });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) done();
      else reject(new Error(`${command} ${args.join(' ')} exited ${code}`));
    });
  });
}

async function scanZip(path) {
  const listing = await capture('unzip', ['-Z', '-1', path]);
  const names = listing.split('\n').map((line) => line.trim()).filter((line) => line && !line.endsWith('/'));
  const lines = [`Zip: ${path}`, `Files: ${names.length}`];
  const failures = [];
  if (names.some((name) => name.includes('..') || name.startsWith('/') || name.includes('node_modules') || name.includes('.git/') || name.endsWith('.map') || name.endsWith('.env') || name.endsWith('CHROMEWEBSTORE.md'))) {
    failures.push('zip contains a path that must stay out of the store package');
  }
  if (!names.includes('manifest.json')) failures.push('manifest.json is missing from the zip root');

  const manifestText = await capture('unzip', ['-p', path, 'manifest.json']);
  const manifest = JSON.parse(manifestText);
  if (Object.prototype.hasOwnProperty.call(manifest, 'key')) failures.push('packaged manifest.json still has a key field');
  if (manifestText.includes(SOURCE_KEY_PREFIX)) failures.push('packaged manifest still contains the unpacked key material');
  if (manifest.manifest_version !== 3) failures.push('packaged manifest is not Manifest V3');
  const hosts = manifest.host_permissions ?? [];
  if (!hosts.includes('https://spacexpad-agent-wallet-auth.timmy2048.workers.dev/*')) {
    failures.push('authorization host is missing');
  }
  if (hosts.some((host) => host.includes('*.workers.dev') || host === '<all_urls>')) {
    failures.push('packaged manifest still has a broad host permission');
  }

  for (const name of names) {
    const bytes = await captureBuffer('unzip', ['-p', path, name]);
    const text = bytes.toString('latin1');
    if (text.includes(SOURCE_KEY_PREFIX)) failures.push(`${name} contains the unpacked manifest key`);
    for (const needle of BLOCKED) {
      if (text.includes(needle)) failures.push(`${name} contains ${needle}`);
    }
    if (name === 'manifest.json') continue;
    if (/"key"\s*:/.test(text) && text.includes('MIIBIj')) failures.push(`${name} looks like a keyed manifest`);
  }

  const freekey = names.length ? await zipIncludes(path, names, 'apiKey=freekey') : false;
  lines.push(`Source manifest key preserved: yes (${sourceManifest.key.slice(0, 12)}…)`);
  lines.push('Packaged manifest key field: absent');
  lines.push(`Blocked strings: ${failures.length === 0 ? 'none' : failures.join('; ')}`);
  lines.push(
    freekey
      ? 'Note: apiKey=freekey is Binplorer’s published public query parameter for BNB token lists. It is not a Privy secret.'
      : 'Note: Binplorer public freekey string was not found.',
  );
  for (const failure of failures) lines.push(`FAIL ${failure}`);
  return lines.join('\n');
}

async function zipIncludes(path, names, needle) {
  for (const name of names) {
    if (!/\.(js|json|html|css|txt)$/.test(name)) continue;
    const text = (await captureBuffer('unzip', ['-p', path, name])).toString('latin1');
    if (text.includes(needle)) return true;
  }
  return false;
}

async function capture(command, args) {
  const buffer = await captureBuffer(command, args);
  return buffer.toString('utf8');
}

function captureBuffer(command, args) {
  return new Promise((done, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    const out = [];
    const err = [];
    child.stdout.on('data', (chunk) => out.push(chunk));
    child.stderr.on('data', (chunk) => err.push(chunk));
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) done(Buffer.concat(out));
      else reject(new Error(`${command} exited ${code}: ${Buffer.concat(err).toString('utf8')}`));
    });
  });
}
