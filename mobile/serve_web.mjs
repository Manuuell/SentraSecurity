// Servidor estático mínimo para previsualizar el build web de Flutter (solo dev).
import { createServer } from 'http';
import { readFile } from 'fs/promises';
import { extname, join } from 'path';
import { fileURLToPath } from 'url';

const root = join(fileURLToPath(new URL('.', import.meta.url)), 'build', 'web');
const types = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.json': 'application/json', '.wasm': 'application/wasm', '.css': 'text/css',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.ttf': 'font/ttf', '.otf': 'font/otf',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
};

createServer(async (req, res) => {
  let p = decodeURIComponent((req.url || '/').split('?')[0]);
  if (p === '/') p = '/index.html';
  try {
    const data = await readFile(join(root, p));
    res.setHeader('Content-Type', types[extname(p)] || 'application/octet-stream');
    res.end(data);
  } catch {
    try {
      const idx = await readFile(join(root, 'index.html'));
      res.setHeader('Content-Type', 'text/html');
      res.end(idx);
    } catch {
      res.statusCode = 404;
      res.end('not found');
    }
  }
}).listen(4321, () => console.log('Flutter web servido en http://localhost:4321'));
