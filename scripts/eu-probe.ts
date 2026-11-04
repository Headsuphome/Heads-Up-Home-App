// Diagnoses why Deno (the runtime Supabase Edge Functions use) can't read EU Safety Gate downloads.
// Tries several request styles plus a raw HTTP/1.1 read over TLS, and reports exactly what happens.
//   deno run --allow-net scripts/eu-probe.ts

const UA = 'HeadsUpHome/1.0 (recall alerts)';
const URLS: Record<string, string> = {
  list: 'https://ec.europa.eu/safety-gate-alerts/api/download/weeklyReport/list/xml/en',
  report: 'https://ec.europa.eu/safety-gate-alerts/api/download/weeklyReport/detail/xml/10000329?language=en&search=WEB_REPORT%7C:%7C10000329,',
  hse: 'https://www.hse.gov.uk/safetybulletins/recent-bulletins.htm',
};
const VARIANTS: Record<string, Record<string, string>> = {
  ours: { Accept: 'text/html', 'User-Agent': UA },
  identity: { Accept: 'text/html', 'User-Agent': UA, 'Accept-Encoding': 'identity' },
  xml: { Accept: 'application/xml', 'User-Agent': UA },
  gzipOnly: { Accept: '*/*', 'User-Agent': UA, 'Accept-Encoding': 'gzip' },
};

function causes(err: unknown): string {
  const parts: string[] = [];
  let e: unknown = err;
  for (let i = 0; e && i < 5; i++) {
    parts.push(e instanceof Error ? `${e.name}: ${e.message}` : String(e));
    e = e instanceof Error ? (e as Error & { cause?: unknown }).cause : undefined;
  }
  return parts.join(' <- ');
}

console.log(`Deno ${Deno.version.deno}`);
for (const [name, url] of Object.entries(URLS)) {
  for (const [vname, headers] of Object.entries(VARIANTS)) {
    const t0 = Date.now();
    let bytes = 0;
    try {
      const res = await fetch(url, { headers, signal: AbortSignal.timeout(30_000) });
      const h = ['content-type', 'content-encoding', 'transfer-encoding', 'content-length', 'connection', 'server']
        .map((k) => `${k}=${res.headers.get(k)}`).join(' ');
      const reader = res.body!.getReader();
      try {
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          bytes += value.length;
        }
        console.log(`OK   ${name}/${vname}: ${res.status} ${bytes} bytes in ${Date.now() - t0}ms | ${h}`);
      } catch (err) {
        console.log(`FAIL ${name}/${vname}: ${res.status} body broke after ${bytes} bytes, ${Date.now() - t0}ms | ${h} | ${causes(err)}`);
      }
    } catch (err) {
      console.log(`FAIL ${name}/${vname}: no response after ${Date.now() - t0}ms | ${causes(err)}`);
    }
  }
}

// Raw HTTP/1.1 over TLS, to see the bytes the server actually sends.
async function raw(url: string, extra: string) {
  const u = new URL(url);
  const conn = await Deno.connectTls({ hostname: u.hostname, port: 443 });
  await conn.write(new TextEncoder().encode(
    `GET ${u.pathname}${u.search} HTTP/1.1\r\nHost: ${u.hostname}\r\nUser-Agent: ${UA}\r\nAccept: */*\r\n${extra}Connection: close\r\n\r\n`));
  const chunks: Uint8Array[] = [];
  const buf = new Uint8Array(65536);
  let total = 0;
  try {
    for (;;) {
      const n = await conn.read(buf);
      if (n === null) break;
      chunks.push(buf.slice(0, n));
      total += n;
    }
  } catch (err) {
    console.log(`  raw read error after ${total} bytes: ${causes(err)}`);
  }
  try { conn.close(); } catch { /* already closed */ }
  const all = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) { all.set(c, at); at += c.length; }
  const text = new TextDecoder('latin1').decode(all);
  const headEnd = text.indexOf('\r\n\r\n');
  console.log(`  raw ${total} bytes; headers:\n${text.slice(0, headEnd).split('\r\n').map((l) => '    ' + l).join('\n')}`);
  if (/transfer-encoding:\s*chunked/i.test(text.slice(0, headEnd))) {
    let p = headEnd + 4, n = 0, body = 0;
    const odd: string[] = [];
    while (p < text.length) {
      const eol = text.indexOf('\r\n', p);
      if (eol < 0) { odd.push(`no CRLF after chunk ${n} at ${p}`); break; }
      const line = text.slice(p, eol);
      if (!/^[0-9a-fA-F]+$/.test(line)) odd.push(`chunk ${n} size line ${JSON.stringify(line.slice(0, 40))}`);
      const size = parseInt(line, 16);
      if (Number.isNaN(size)) break;
      if (size === 0) { console.log(`  chunked: ${n} chunks, ${body} body bytes, ends cleanly=${text.slice(eol, eol + 4) === '\r\n\r\n'}, trailing=${text.length - eol - 4}`); break; }
      p = eol + 2 + size;
      if (text.slice(p, p + 2) !== '\r\n') odd.push(`chunk ${n} not followed by CRLF: ${JSON.stringify(text.slice(p, p + 10))}`);
      p += 2; n++; body += size;
    }
    if (p >= text.length) console.log(`  chunked: stream ended without a final 0 chunk after ${n} chunks`);
    console.log(`  oddities: ${odd.length ? odd.slice(0, 5).join(' | ') : 'none'}`);
  }
}
for (const [name, url] of Object.entries({ list: URLS.list, report: URLS.report })) {
  for (const [label, extra] of [['identity', 'Accept-Encoding: identity\r\n'], ['gzip', 'Accept-Encoding: gzip\r\n']]) {
    console.log(`RAW ${name}/${label}`);
    try { await raw(url, extra); } catch (err) { console.log(`  raw failed: ${causes(err)}`); }
  }
}
