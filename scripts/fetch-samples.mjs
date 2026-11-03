// Saves raw responses from the recall sources, so parsers can be written against real data.
// Usage: node scripts/fetch-samples.mjs <list.json> <out dir>
// Each entry: { "name": "...", "url": "...", "follow"?: "<regex with one capture group for URLs to fetch too>", "max"?: 3 }
import { mkdir, readFile, writeFile } from 'node:fs/promises';

const [listPath, outDir] = process.argv.slice(2);
const list = JSON.parse(await readFile(listPath, 'utf8'));
await mkdir(outDir, { recursive: true });
const UA = { 'User-Agent': 'HeadsUpHome/1.0 (+https://headsuphome.co.uk)' };

async function save(name, url) {
  try {
    const res = await fetch(url, { headers: UA, redirect: 'follow' });
    const text = await res.text();
    await writeFile(`${outDir}/${name}`, text.slice(0, 600_000));
    console.log(`${res.status} ${name} ${url} ${text.length} chars ${res.headers.get('content-type')}`);
    return text;
  } catch (e) {
    console.log(`ERR ${name} ${url} ${e}`);
    return '';
  }
}

for (const item of list) {
  const text = await save(`${item.name}.txt`, item.url);
  if (item.follow && text) {
    const seen = new Set();
    for (const m of text.matchAll(new RegExp(item.follow, 'g'))) {
      let u = m[1].replace(/&amp;/g, '&');
      if (u.startsWith('/')) u = new URL(u, item.url).toString();
      if (seen.has(u)) continue;
      seen.add(u);
      if (seen.size > (item.max ?? 3)) break;
      await save(`${item.name}-${seen.size}.txt`, u);
    }
  }
}
