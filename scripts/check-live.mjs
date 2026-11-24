// Proves jotarium.com serves this checkout: both pages and every asset they reference match the local files.
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const site = process.argv[2] ?? 'https://jotarium.com';
const isText = path => /\.(html|css|js|json|svg)$/.test(path);
const lf = s => s.replaceAll('\r\n', '\n');
const digest = (path, bytes) => createHash('sha256').update(isText(path) ? lf(bytes.toString('utf8')) : bytes).digest('hex');
const fetchFresh = path => fetch(`${site}/${path}?check=${Date.now()}`);

const refs = new Set();
let stale = 0;
for (const page of ['index.html', 'guide/index.html']) {
  const html = await readFile(page, 'utf8');
  for (const [, ref] of html.matchAll(/(?:src|href)="(?:\.\.\/)?(assets\/[^"?]+)/g)) refs.add(ref);
  const live = await (await fetchFresh(page.replace('index.html', ''))).text();
  if (lf(live) !== lf(html)) { console.error(`STALE ${page}`); stale++; }
}
for (const ref of [...refs].sort()) {
  const res = await fetchFresh(ref);
  if (!res.ok || digest(ref, Buffer.from(await res.arrayBuffer())) !== digest(ref, await readFile(ref))) {
    console.error(`STALE ${ref} (${res.status})`);
    stale++;
  }
}
console.log(stale ? `live site differs from this checkout in ${stale} files` : `live site matches: 2 pages and ${refs.size} assets`);
process.exitCode = stale ? 1 : 0;
