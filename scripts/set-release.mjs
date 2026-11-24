#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const RELEASE_BASE = 'https://github.com/Casper5253/jotarium-website/releases/download';
const DOWNLOAD_PAGE = 'https://jotarium.com/#download';
const AVAILABLE = '27 November';
const BEGIN = '        <!-- release:begin -->';
const END = '        <!-- release:end -->';

const PLATFORMS = [
  {
    id: 'win-x64',
    suffix: '-win-x64.exe',
    name: 'Windows',
    arch: 'x64',
    button: 'Download .exe',
    label: 'Download for Windows',
    checkLabel: 'Check in PowerShell',
    command: (file) => `Get-FileHash "$HOME\\Downloads\\${file}" -Algorithm SHA256`,
  },
  {
    id: 'mac-arm64',
    suffix: '-mac-arm64.dmg',
    name: 'Mac',
    arch: 'Apple silicon',
    button: 'Download .dmg',
    label: 'Download for Mac (Apple silicon)',
    checkLabel: 'Check in Terminal',
    command: (file) => `shasum -a 256 ~/Downloads/${file}`,
  },
  {
    id: 'mac-x64',
    suffix: '-mac-x64.dmg',
    name: 'Mac',
    arch: 'Intel',
    button: 'Download .dmg',
    label: 'Download for Mac (Intel)',
    checkLabel: 'Check in Terminal',
    command: (file) => `shasum -a 256 ~/Downloads/${file}`,
  },
];

class ReleaseError extends Error {}

function usage() {
  console.log(`Usage:
  node scripts/set-release.mjs <version> <SHA256SUMS path>   switch the page to a release
  node scripts/set-release.mjs --prerelease                  back to the ${AVAILABLE} state

The sums file must sit beside the installers. Before writing anything the script checks
each local size and SHA-256, downloads every published download URL, and checks its HTTP
status and SHA-256 against the sums file. A failed download stops the switch.

  --skip-remote-check   tests only: skip the download check`);
}

function fail(message) {
  throw new ReleaseError(message);
}

function formatSize(bytes) {
  return `${(bytes / 1e6).toFixed(1)} MB`;
}

function readSums(path) {
  const sums = new Map();
  for (const raw of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const match = /^([a-f0-9]{64})\s+\*?(.+)$/i.exec(line);
    if (!match) fail(`cannot parse checksum line: ${line}`);
    sums.set(match[2].trim(), match[1].toLowerCase());
  }
  return { dir: dirname(path), sums };
}

function inspect(dir, sums, version) {
  return PLATFORMS.map((platform) => {
    const file = `Jotarium-${version}${platform.suffix}`;
    const hash = sums.get(file);
    if (!hash) fail(`no checksum for ${file} in the sums file`);
    const path = join(dir, file);
    let stat;
    try {
      stat = statSync(path);
    } catch {
      fail(`missing installer beside the sums file: ${file}`);
    }
    const actual = createHash('sha256').update(readFileSync(path)).digest('hex');
    if (actual !== hash) fail(`${file} does not match its checksum (read ${actual})`);
    return { ...platform, file, hash, size: formatSize(stat.size), url: `${RELEASE_BASE}/v${version}/${file}` };
  });
}

export async function verifyRemote(assets, fetchImpl = globalThis.fetch) {
  if (typeof fetchImpl !== 'function') fail('no fetch implementation for the download check');
  for (const asset of assets) {
    let response;
    let bytes;
    try {
      response = await fetchImpl(asset.url, { redirect: 'follow' });
      if (!response.ok) fail(`${asset.url} returned HTTP ${response.status}; the release asset is not downloadable yet`);
      bytes = Buffer.from(await response.arrayBuffer());
    } catch (error) {
      if (error instanceof ReleaseError) throw error;
      fail(`cannot download ${asset.url}: ${error instanceof Error ? error.message : String(error)}`);
    }
    const actual = createHash('sha256').update(bytes).digest('hex');
    if (actual !== asset.hash) {
      fail(`${asset.url} does not match its checksum (downloaded ${actual}, expected ${asset.hash})`);
    }
    console.log(`checked ${asset.url} (${response.status}, ${formatSize(bytes.length)})`);
  }
}

function renderCard(platform, body, download) {
  const attrs = download
    ? ` data-download-url="${download.url}" data-download-size="${download.size}" data-download-label="${platform.label}"`
    : '';
  return `          <article class="dl-card" data-platform="${platform.id}"${attrs}>
            <p class="dl-pick" hidden>Recommended for this computer</p>
            <h3>${platform.name} <span class="dl-arch">${platform.arch}</span></h3>
${body}
          </article>`;
}

function renderPrerelease() {
  const cards = PLATFORMS.map((platform) => renderCard(platform, `            <p class="dl-note">Available ${AVAILABLE}${platform.id === 'win-x64' ? '' : '. Needs macOS 15 or later.'}</p>
            <a class="btn btn-primary dl-btn" aria-disabled="true" tabindex="-1">${platform.button}</a>`)).join('\n');
  return `        <h2>Available ${AVAILABLE}</h2>
        <p>Jotarium's first public release arrives on ${AVAILABLE} for Windows and macOS. The buttons switch on when the release is live.</p>
        <div class="download-grid">
${cards}
        </div>`;
}

function renderReleased(version, assets) {
  const cards = assets.map((asset) => renderCard(asset, `            <p class="dl-file">${asset.file}</p>
            <p class="dl-size">${asset.size}</p>
            <a class="btn btn-primary dl-btn" href="${asset.url}">${asset.button}</a>
            <details class="dl-verify">
              <summary>Check the download (optional)</summary>
              <p>Compare this fingerprint with your download to make sure the file arrived intact.</p>
              <dl class="dl-facts">
                <dt>SHA-256</dt><dd><code>${asset.hash}</code></dd>
              </dl>
              <p class="dl-check">${asset.checkLabel} <code>${asset.command(asset.file)}</code></p>
            </details>`, asset)).join('\n');
  return `        <h2>Download Jotarium ${version}</h2>
        <p>Free to download and play. Choose the build for your computer.</p>
        <div class="download-grid">
${cards}
        </div>
        <p class="dl-mac-hint">Which Mac? Open the Apple menu and choose About This Mac. An Apple M-series chip means Apple silicon. No Chip row means Intel. The Mac build needs macOS 15 (Sequoia) or later.</p>
        <div class="install-steps">
          <article>
            <h3>On Windows</h3>
            <ol>
              <li>Run the .exe. SmartScreen may say "Windows protected your PC".</li>
              <li>Choose <strong>More info</strong>, then <strong>Run anyway</strong>.</li>
              <li>Follow the installer. Jotarium opens when it finishes.</li>
            </ol>
          </article>
          <article>
            <h3>On Mac</h3>
            <ol>
              <li>Open the .dmg and drag Jotarium to Applications.</li>
              <li>Open Jotarium once. macOS blocks it, so choose <strong>Done</strong>.</li>
              <li>Open <strong>System Settings</strong>, then <strong>Privacy and Security</strong>. Under Security, choose <strong>Open Anyway</strong> for Jotarium, then <strong>Open</strong>.</li>
            </ol>
          </article>
        </div>
        <p class="dl-upgrade">Upgrading keeps your save. Backups are automatic.</p>
        <p class="dl-trust">These builds are unsigned. Only continue with a download you trust.</p>`;
}

function writePage(indexPath, block, release, version) {
  let html = readFileSync(indexPath, 'utf8');
  const start = html.indexOf(BEGIN);
  const end = html.indexOf(END);
  if (start === -1 || end === -1 || end < start) fail('release markers not found in index.html');
  html = html.slice(0, start) + `${BEGIN}\n${block}\n${END}` + html.slice(end + END.length);
  html = html.replace(/<section id="download"[^>]*>/, `<section id="download" class="download" data-release="${release}" data-version="${version}">`);
  const cta = release === 'released' ? `Download Jotarium ${version}` : `Available ${AVAILABLE}`;
  if (!/<span data-release-cta>[^<]*<\/span>/.test(html)) fail('release call to action not found in index.html');
  html = html.replace(/(<span data-release-cta>)[^<]*(<\/span>)/, `$1${cta}$2`);
  writeFileSync(indexPath, html);
}

function writeVersion(versionPath, version) {
  let notes = 'The first public release.';
  try {
    const current = JSON.parse(readFileSync(versionPath, 'utf8'));
    if (typeof current.notes === 'string') notes = current.notes;
  } catch {
    // A missing or unreadable feed keeps the default note.
  }
  const payload = { latest: version, url: DOWNLOAD_PAGE, notes };
  writeFileSync(versionPath, `${JSON.stringify(payload, null, 2)}\n`);
}

export async function main(argv, options = {}) {
  const root = options.root ?? ROOT;
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const indexPath = join(root, 'index.html');
  const versionPath = join(root, 'version.json');
  const skipRemote = argv.includes('--skip-remote-check');
  const args = argv.filter((arg) => arg !== '--skip-remote-check');

  if (args.length === 0) {
    usage();
    return 1;
  }
  if (args[0] === '--help' || args[0] === '-h') {
    usage();
    return 0;
  }
  if (args[0] === '--prerelease' || args[0] === '--reset') {
    writePage(indexPath, renderPrerelease(), 'prerelease', '');
    console.log(`Download section set to the ${AVAILABLE} pre-release state. version.json is unchanged.`);
    return 0;
  }

  const [version, sumsPath] = args;
  if (!version || !sumsPath) {
    usage();
    return 1;
  }
  if (!/^[0-9A-Za-z][0-9A-Za-z.-]*$/.test(version)) fail(`invalid version: ${version}`);
  if (!/^\d+\.\d+\.\d+$/.test(version)) fail(`version.json needs a MAJOR.MINOR.PATCH version, got ${version}`);
  const absoluteSums = resolve(sumsPath);
  if (!statSync(absoluteSums, { throwIfNoEntry: false })) fail(`checksum file not found: ${absoluteSums}`);

  const { dir, sums } = readSums(absoluteSums);
  const assets = inspect(dir, sums, version);
  if (!skipRemote) await verifyRemote(assets, fetchImpl);

  writePage(indexPath, renderReleased(version, assets), 'released', version);
  writeVersion(versionPath, version);
  console.log(`Download section set to ${version}.`);
  for (const asset of assets) console.log(`${asset.id}: ${asset.size} ${asset.hash} ${asset.url}`);
  return 0;
}

const isEntry = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isEntry) {
  main(process.argv.slice(2))
    .then((code) => {
      if (code) process.exitCode = code;
    })
    .catch((error) => {
      console.error(`set-release: ${error instanceof ReleaseError ? error.message : error.stack ?? error}`);
      process.exitCode = 1;
    });
}
