// Minimal zero-dependency static server for the built app (dist/).
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../dist/', import.meta.url));
const port = Number(process.env.SCRIBBLR_PORT || 5173);
const types = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json',
  '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json',
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', 'http://localhost');
  if (url.pathname === '/__scribblr') { res.end('scribblr'); return; }
  let rel = normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, '');
  if (rel.includes('..')) { res.writeHead(400); res.end(); return; }
  let file = join(root, rel || 'index.html');
  try {
    if (!(await stat(file)).isFile()) throw 0;
  } catch {
    file = join(root, 'index.html'); // SPA fallback
  }
  try {
    const body = await readFile(file);
    const immutable = file.includes('assets') && !file.endsWith('.html');
    res.writeHead(200, {
      'Content-Type': types[extname(file)] || 'application/octet-stream',
      'Cache-Control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
    });
    res.end(body);
  } catch {
    res.writeHead(404); res.end('Not found');
  }
});

server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') console.error(`[scribblr] Port ${port} is in use by another program. Set SCRIBBLR_PORT to another port.`);
  else console.error(e);
  process.exit(1);
});
server.listen(port, '127.0.0.1', () => console.log(`[scribblr] Running at http://localhost:${port}  (Ctrl+C to stop)`));
