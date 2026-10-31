/** Loopback-only QA proxy. Keeps the designated evaluation Cookie out of browser storage and logs. */
import http from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { resolve, extname, sep } from 'node:path';
import assert from 'node:assert/strict';
const credentials = JSON.parse(readFileSync(resolve(process.argv[2]), 'utf8'));
assert(credentials.evaluation && /^decision-eval-/.test(credentials.username));
assert(credentials.origin === 'https://vivic.edsionc.top');
const port = Number(process.env.VIVIC_ANDROID_QA_PORT || 19446);
const localOrigin = `http://127.0.0.1:${port}`;
const apiOrigin = process.env.VIVIC_ANDROID_QA_API || credentials.origin;
assert(apiOrigin === credentials.origin || apiOrigin === 'http://127.0.0.1:19447');
const overlay = process.env.VIVIC_ANDROID_QA_WEB ? resolve(process.env.VIVIC_ANDROID_QA_WEB) : null;
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, localOrigin);
    if (url.origin !== localOrigin) { response.writeHead(400).end(); return; }
    if (overlay && ['GET', 'HEAD'].includes(request.method) && !url.pathname.startsWith('/api/')) {
      const relative = url.pathname.startsWith('/assets/') ? decodeURIComponent(url.pathname).slice(1) : 'index.html';
      const candidate = resolve(overlay, relative);
      if (!candidate.startsWith(overlay + sep)) { response.writeHead(400).end(); return; }
      if (existsSync(candidate) && statSync(candidate).isFile()) {
        response.writeHead(200, { 'Content-Type': mime[extname(candidate)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
        response.end(request.method === 'HEAD' ? undefined : readFileSync(candidate)); return;
      }
    }
    const write = !['GET', 'HEAD'].includes(request.method);
    if (write && request.headers.origin !== localOrigin) { response.writeHead(403).end(); return; }
    const chunks = []; let bytes = 0;
    for await (const chunk of request) { bytes += chunk.length; if (bytes > 24 * 1024 * 1024) throw Error('body-limit'); chunks.push(chunk); }
    const headers = { ...(url.pathname.startsWith('/api/') ? { Cookie: credentials.cookie, Origin: credentials.origin } : {}),
      ...(request.headers['content-type'] ? { 'Content-Type': request.headers['content-type'] } : {}),
      ...(request.headers.accept ? { Accept: request.headers.accept } : {}) };
    const controller = new AbortController(); response.on('close', () => controller.abort());
    const upstream = await fetch((url.pathname.startsWith('/api/') ? apiOrigin : credentials.origin) + url.pathname + url.search, { method: request.method, headers,
      ...(write ? { body: Buffer.concat(chunks) } : {}), redirect: 'manual', signal: controller.signal });
    const output = Object.fromEntries([...upstream.headers].filter(([key]) => !['set-cookie', 'content-length', 'content-encoding', 'connection', 'transfer-encoding'].includes(key)));
    response.writeHead(upstream.status, output);
    if (upstream.body) for await (const chunk of upstream.body) { if (!response.destroyed) response.write(chunk); }
    response.end();
  } catch { if (!response.headersSent) response.writeHead(502, { 'Content-Type': 'application/json' }); response.end('{"ok":false,"message":"QA connection unavailable"}'); }
});
server.listen(port, '127.0.0.1', () => process.stdout.write(`Evaluation QA proxy ready on ${localOrigin}\n`));
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => server.close(() => process.exit(0)));
