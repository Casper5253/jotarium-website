#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const INDEX = join(ROOT, 'index.html');
const RELEASE_BASE = 'https://github.com/Casper5253/jotarium-website/releases/download';
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

function usage() {
  console.log(`Usage:
  node scripts/set-release.mjs <version> <SHA256SUMS path>   switch the page to a release
  node scripts/set-release.mjs --prerelease                  back to the ${AVAILABLE} state

The sums file must sit beside the installers. The script reads each size from disk and
checks every file against its SHA-256 before it writes the page.`);
}

function fail(message) {
  console.error(`set-release: ${message}`);
  process.exit(1);
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
  const cards = PLATFORMS.map((platform) => renderCard(platform, `            <p class="dl-note">Available ${AVAILABLE}</p>
            <a class="btn btn-primary dl-btn" aria-disabled="true" tabindex="-1">${platform.button}</a>`)).join('\n');
  return `        <h2>Available ${AVAILABLE}</h2>
        <p>Jotarium's first public release arrives on ${AVAILABLE} for Windows and macOS. The buttons switch on when the release is live.</p>
        <div class="download-grid">
${cards}
        </div>`;
}

function renderReleased(version, assets) {
  const cards = assets.map((asset) => renderCard(asset, `            <p class="dl-file">${asset.file}</p>
            <a class="btn btn-primary dl-btn" href="${asset.url}">${asset.button}</a>
            <dl class="dl-facts">
              <dt>Version</dt><dd>${version}</dd>
              <dt>Size</dt><dd>${asset.size}</dd>
              <dt>SHA-256</dt><dd><code>${asset.hash}</code></dd>
            </dl>
            <p class="dl-check">${asset.checkLabel} <code>${asset.command(asset.file)}</code></p>`, asset)).join('\n');
  return `        <h2>Download Jotarium ${version}</h2>
        <p>Free to download and play. Choose the build for your computer.</p>
        <div class="download-grid">
${cards}
        </div>
        <p class="dl-mac-hint">Which Mac? Open the Apple menu and choose About This Mac. An Apple M-series chip means Apple silicon. No Chip row means Intel.</p>
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

function writePage(block, release, version) {
  let html = readFileSync(INDEX, 'utf8');
  const start = html.indexOf(BEGIN);
  const end = html.indexOf(END);
  if (start === -1 || end === -1 || end < start) fail('release markers not found in index.html');
  html = html.slice(0, start) + `${BEGIN}\n${block}\n${END}` + html.slice(end + END.length);
  html = html.replace(/<section id="download"[^>]*>/, `<section id="download" class="download" data-release="${release}" data-version="${version}">`);
  const cta = release === 'released' ? `Download Jotarium ${version}` : `Available ${AVAILABLE}`;
  if (!/<span data-release-cta>[^<]*<\/span>/.test(html)) fail('release call to action not found in index.html');
  html = html.replace(/(<span data-release-cta>)[^<]*(<\/span>)/, `$1${cta}$2`);
  writeFileSync(INDEX, html);
}

const args = process.argv.slice(2);
if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
  usage();
  process.exit(args.length === 0 ? 1 : 0);
}
if (args[0] === '--prerelease' || args[0] === '--reset') {
  writePage(renderPrerelease(), 'prerelease', '');
  console.log(`Download section set to the ${AVAILABLE} pre-release state.`);
  process.exit(0);
}

const [version, sumsPath] = args;
if (!version || !sumsPath) {
  usage();
  process.exit(1);
}
if (!/^[0-9A-Za-z][0-9A-Za-z.-]*$/.test(version)) fail(`invalid version: ${version}`);
const absoluteSums = resolve(sumsPath);
if (!statSync(absoluteSums, { throwIfNoEntry: false })) fail(`checksum file not found: ${absoluteSums}`);

const { dir, sums } = readSums(absoluteSums);
const assets = inspect(dir, sums, version);
writePage(renderReleased(version, assets), 'released', version);
console.log(`Download section set to ${version}.`);
for (const asset of assets) console.log(`${asset.id}: ${asset.size} ${asset.hash} ${asset.url}`);
