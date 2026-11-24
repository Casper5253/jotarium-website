// Proves jotarium.com serves this checkout: every asset the pages reference must match the local file byte for byte.
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const site = process.argv[2] ?? 'https://jotarium.com';
const sha = b => createHash('sha256').update(b).digest('hex');
const refs = new Set();
for (const page of ['index.html', 'guide/index.html']) {
  const html = await readFile(page, 'utf8');
  for (const [, url] of html.matchAll(/(?:src|href)="(?:\.\.\/)?(assets\/[^"?]+)/g)) refs.add(url);
  const live = await (await fetch(`${site}/${page.replace('index.html', '')}?check=${Date.now()}`)).text();
  if (live !== html) { console.error(`STALE ${page}`); process.exitCode = 1; }
}
for (const ref of [...refs].sort()) {
  const res = await fetch(`${site}/${ref}?check=${Date.now()}`);
  const ok = res.ok && sha(Buffer.from(await res.arrayBuffer())) === sha(await readFile(ref));
  if (!ok) { console.error(`STALE ${ref} (${res.status})`); process.exitCode = 1; }
}
console.log(process.exitCode ? 'live site differs from this checkout' : `live site matches: ${refs.size} assets and 2 pages`);
