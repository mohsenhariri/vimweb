import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';

const root = new URL('../', import.meta.url);
const files = new Set(['/test/fixture.html', '/demo/index.html', '/auto.js', '/index.js', '/hints.js', '/help.js']);
const port = Number(process.argv[2] || 8000);

createServer(async (request, response) => {
  const { pathname } = new URL(request.url, 'http://127.0.0.1');
  const file = pathname === '/' || pathname === '/demo/' ? '/demo/index.html' : pathname;
  if (!files.has(file)) {
    response.writeHead(404).end();
    return;
  }
  try {
    const content = await readFile(new URL(`.${file}`, root));
    const type = file.endsWith('.js') ? 'text/javascript' : 'text/html';
    response.writeHead(200, { 'Content-Type': `${type}; charset=utf-8` }).end(content);
  } catch (error) {
    if (error.code !== 'ENOENT') console.error(error);
    response.writeHead(error.code === 'ENOENT' ? 404 : 500).end();
  }
}).listen(port, '127.0.0.1', () => console.log(`Serving Vimweb at http://127.0.0.1:${port}/`));
