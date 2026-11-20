import { readdir, readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../dist', import.meta.url));
const port = Number(process.argv[2] ?? 8000);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Expected a port from 1 to 65535.');

const mime = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.tgz': 'application/gzip',
  '': 'text/plain; charset=utf-8',
};
const files = new Map();
for (const entry of await readdir(root, { recursive: true, withFileTypes: true })) {
  if (!entry.isFile()) continue;
  const absolute = path.join(entry.parentPath, entry.name);
  const pathname = '/' + path.relative(root, absolute).split(path.sep).join('/');
  files.set(pathname, absolute);
}

createServer(async (request, response) => {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405, { Allow: 'GET, HEAD' }).end();
    return;
  }
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
  } catch {
    response.writeHead(400).end();
    return;
  }
  const file = files.get(pathname.endsWith('/') ? pathname + 'index.html' : pathname);
  if (!file) {
    response.writeHead(404).end();
    return;
  }
  try {
    const data = await readFile(file);
    response.writeHead(200, {
      'Content-Type': mime[path.extname(file)] ?? 'application/octet-stream',
      'Content-Length': data.length,
      'X-Content-Type-Options': 'nosniff',
    }).end(request.method === 'HEAD' ? undefined : data);
  } catch (error) {
    console.error(error);
    response.writeHead(500).end();
  }
}).listen(port, '127.0.0.1', () => console.log(`Vimweb website: http://127.0.0.1:${port}/`));
