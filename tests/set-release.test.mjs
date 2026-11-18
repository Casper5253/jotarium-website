import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { main } from '../scripts/set-release.mjs';

const VERSION = '1.0.1';
const FILES = [
  `Jotarium-${VERSION}-win-x64.exe`,
  `Jotarium-${VERSION}-mac-arm64.dmg`,
  `Jotarium-${VERSION}-mac-x64.dmg`,
];
const URL_BASE = `https://github.com/Casper5253/jotarium-website/releases/download/v${VERSION}`;

function workspace() {
  const root = mkdtempSync(join(tmpdir(), 'set-release-'));
  const repo = new URL('..', import.meta.url);
  writeFileSync(join(root, 'index.html'), readFileSync(new URL('index.html', repo)));
  writeFileSync(join(root, 'version.json'), readFileSync(new URL('version.json', repo)));
  const release = join(root, 'release');
  mkdirSync(release);
  const bodies = new Map();
  const sums = [];
  FILES.forEach((file, index) => {
    const body = Buffer.alloc(2048 + index, 65 + index);
    bodies.set(file, body);
    writeFileSync(join(release, file), body);
    sums.push(`${createHash('sha256').update(body).digest('hex')}  ${file}`);
  });
  const sumsPath = join(release, 'SHA256SUMS.txt');
  writeFileSync(sumsPath, `${sums.join('\n')}\n`);
  return { root, release, bodies, sumsPath };
}

function serving(bodies, requested = []) {
  return async (url) => {
    requested.push(url);
    const body = bodies.get(url.split('/').pop());
    if (!body) return { ok: false, status: 404 };
    return { ok: true, status: 200, arrayBuffer: async () => new Uint8Array(body).buffer };
  };
}

function read(root, name) {
  return readFileSync(join(root, name), 'utf8');
}

test('released mode checks every published URL, then writes the page and version.json', async () => {
  const ws = workspace();
  const requested = [];
  const notes = JSON.parse(read(ws.root, 'version.json')).notes;

  const code = await main([VERSION, ws.sumsPath], { root: ws.root, fetchImpl: serving(ws.bodies, requested) });

  assert.equal(code, 0);
  assert.deepEqual(requested, FILES.map((file) => `${URL_BASE}/${file}`));

  const html = read(ws.root, 'index.html');
  assert.match(html, /data-release="released"/);
  for (const file of FILES) assert.match(html, new RegExp(`data-download-url="[^"]*/${file.replace(/[.]/g, '\\.')}"`));

  const version = JSON.parse(read(ws.root, 'version.json'));
  assert.deepEqual(version, { latest: VERSION, url: 'https://jotarium.com/#download', notes });
});

test('a 404 stops the switch before index.html or version.json is written', async () => {
  const ws = workspace();
  const before = { html: read(ws.root, 'index.html'), version: read(ws.root, 'version.json') };
  const fetchImpl = serving(new Map([...ws.bodies].filter(([file]) => file !== FILES[1])));

  await assert.rejects(main([VERSION, ws.sumsPath], { root: ws.root, fetchImpl }), /HTTP 404/);

  assert.equal(read(ws.root, 'index.html'), before.html);
  assert.equal(read(ws.root, 'version.json'), before.version);
});

test('a hash mismatch stops the switch before index.html or version.json is written', async () => {
  const ws = workspace();
  const before = { html: read(ws.root, 'index.html'), version: read(ws.root, 'version.json') };
  const tampered = new Map(ws.bodies);
  const wrong = Buffer.from(ws.bodies.get(FILES[0]));
  wrong[0] ^= 0xff;
  tampered.set(FILES[0], wrong);

  await assert.rejects(main([VERSION, ws.sumsPath], { root: ws.root, fetchImpl: serving(tampered) }), /does not match its checksum/);

  assert.equal(read(ws.root, 'index.html'), before.html);
  assert.equal(read(ws.root, 'version.json'), before.version);
});

test('a missing download is checked by default, and the test-only flag skips the downloads', async () => {
  const ws = workspace();
  let calls = 0;
  const unreachable = async () => {
    calls += 1;
    throw new Error('offline');
  };

  await assert.rejects(main([VERSION, ws.sumsPath], { root: ws.root, fetchImpl: unreachable }), /cannot download/);
  assert.equal(calls, 1);

  calls = 0;
  const code = await main([VERSION, ws.sumsPath, '--skip-remote-check'], { root: ws.root, fetchImpl: unreachable });
  assert.equal(code, 0);
  assert.equal(calls, 0);
  assert.match(read(ws.root, 'index.html'), /data-release="released"/);
});

test('prerelease leaves version.json untouched', async () => {
  const ws = workspace();
  await main([VERSION, ws.sumsPath], { root: ws.root, fetchImpl: serving(ws.bodies) });
  const releasedVersion = read(ws.root, 'version.json');
  assert.equal(JSON.parse(releasedVersion).latest, VERSION);

  assert.equal(await main(['--prerelease'], { root: ws.root }), 0);
  assert.equal(read(ws.root, 'version.json'), releasedVersion);
  assert.match(read(ws.root, 'index.html'), /data-release="prerelease"/);
});

test('the CLI entry point switches the copy it lives in', () => {
  const ws = workspace();
  mkdirSync(join(ws.root, 'scripts'));
  copyFileSync(fileURLToPath(new URL('../scripts/set-release.mjs', import.meta.url)), join(ws.root, 'scripts', 'set-release.mjs'));

  execFileSync(process.execPath, [join(ws.root, 'scripts', 'set-release.mjs'), VERSION, ws.sumsPath, '--skip-remote-check'], { cwd: ws.root, stdio: 'pipe' });

  assert.match(read(ws.root, 'index.html'), /data-release="released"/);
  assert.equal(JSON.parse(read(ws.root, 'version.json')).latest, VERSION);
});
