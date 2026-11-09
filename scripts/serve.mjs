/** Dependency-free development server. Serve only dist/, on loopback by default. */
import {createServer} from 'node:http';
import {createReadStream} from 'node:fs';
import {realpath, stat} from 'node:fs/promises';
import {extname, join, relative, sep} from 'node:path';
import {fileURLToPath} from 'node:url';

const args = process.argv.slice(2);
let host = process.env.EKG_HOST || '127.0.0.1';
let port = Number(process.env.PORT || 8000);
for (let index = 0; index < args.length; index++) {
  const option = args[index];
  if (option === '--host' && args[index + 1]) host = args[++index];
  else if (option === '--port' && args[index + 1]) port = Number(args[++index]);
  else {
    console.error('Usage: npm start -- [--host 127.0.0.1] [--port 8000]');
    process.exit(2);
  }
}
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error('Port must be an integer from 1 to 65535.');
  process.exit(2);
}
const root = await realpath(fileURLToPath(new URL('../dist/', import.meta.url)));
const mime = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.md': 'text/plain; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.glb': 'model/gltf-binary',
  '.zip': 'application/zip', '.pdf': 'application/pdf',
};
const inside = path => {
  const rel = relative(root, path);
  return rel === '' || (rel !== '..' && !rel.startsWith('..' + sep) && !rel.startsWith(sep));
};
const server = createServer(async (request, response) => {
  const finish = (status, text, headers = {}) => {
    response.writeHead(status, {'Content-Type': 'text/plain; charset=utf-8', ...headers});
    response.end(request.method === 'HEAD' ? undefined : text);
  };
  if (!['GET', 'HEAD'].includes(request.method)) return finish(405, 'Method not allowed\n', {Allow: 'GET, HEAD'});
  try {
    const url = new URL(request.url, 'http://localhost');
    let pathname;
    try { pathname = decodeURIComponent(url.pathname); }
    catch { return finish(400, 'Invalid path\n'); }
    if (pathname.includes('\0') || pathname.includes('\\')) return finish(400, 'Invalid path\n');
    let path = join(root, pathname);
    if (!inside(path)) return finish(403, 'Forbidden\n');
    let info = await stat(path);
    if (info.isDirectory()) {
      if (!pathname.endsWith('/')) return finish(301, 'Redirecting\n', {Location: url.pathname + '/' + url.search});
      path = join(path, 'index.html');
      info = await stat(path);
    }
    if (!info.isFile() || !inside(await realpath(path))) return finish(403, 'Forbidden\n');
    response.writeHead(200, {
      'Content-Type': mime[extname(path).toLowerCase()] || 'application/octet-stream',
      'Content-Length': info.size,
      'Cache-Control': 'no-cache',
      'X-Content-Type-Options': 'nosniff',
    });
    if (request.method === 'HEAD') return response.end();
    const stream = createReadStream(path);
    stream.on('error', error => response.destroy(error));
    response.on('close', () => stream.destroy());
    stream.pipe(response);
  } catch (error) {
    if (response.headersSent) response.destroy();
    else finish(error.code === 'ENOENT' || error.code === 'ENOTDIR' ? 404 : 500, 'File unavailable\n');
  }
});
server.on('error', error => {
  console.error(`Could not start EKG Lab: ${error.message}`);
  process.exitCode = 1;
});
server.listen(port, host, () => console.log(`EKG Lab: http://${host.includes(':') ? '[' + host + ']' : host}:${port}\nServing dist/. Press Ctrl+C to stop.`));
process.on('SIGINT', () => server.close());
process.on('SIGTERM', () => server.close());
