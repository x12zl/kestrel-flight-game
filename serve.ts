// Static file server for local browser play-testing and screenshot capture.
import { createReadStream, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const gameRoot = resolve(fileURLToPath(new URL('./game', import.meta.url)));
const argv = process.argv.slice(2);
const portArgIdx = argv.indexOf('--port');
const parsedPort = portArgIdx === -1 ? 8080 : Number(argv[portArgIdx + 1]);
const port = Number.isInteger(parsedPort) && parsedPort > 0 && parsedPort < 65536 ? parsedPort : 8080;

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
};

const server = createServer((req, res) => {
  const reqUrl = new URL(req.url ?? '/', 'http://127.0.0.1');
  let pathname: string;
  try {
    pathname = decodeURIComponent(reqUrl.pathname);
  } catch {
    res.writeHead(400).end('Bad Request');
    return;
  }
  if (pathname.endsWith('/')) pathname += 'index.html';
  const targetPath = resolve(join(gameRoot, normalize(pathname)));
  if (targetPath !== gameRoot && !targetPath.startsWith(gameRoot + sep)) {
    res.writeHead(403).end('Forbidden');
    return;
  }
  try {
    const info = statSync(targetPath);
    if (!info.isFile()) {
      res.writeHead(404).end('Not Found');
      return;
    }
    const type = CONTENT_TYPES[extname(targetPath).toLowerCase()] ?? 'application/octet-stream';
    res.writeHead(200, {
      'content-type': type,
      'content-length': info.size,
      'cache-control': 'no-store',
    });
    createReadStream(targetPath).pipe(res);
  } catch {
    res.writeHead(404).end('Not Found');
  }
});

server.listen(port, '127.0.0.1', () => {
  console.log(`Kestrel serving game/ at http://127.0.0.1:${port}`);
});
