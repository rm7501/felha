import http from 'http'; import fs from 'fs'; import path from 'path';
const root = path.resolve(process.argv[2] || 'dist'); const port = +process.argv[3] || 5173;
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8', '.png': 'image/png' };
http.createServer((q, s) => { let p = decodeURIComponent(q.url.split('?')[0].split('#')[0]); if (p === '/') p = '/index.html'; const f = path.join(root, p); if (!f.startsWith(root) || !fs.existsSync(f)) { s.writeHead(404); s.end('nf'); return; } s.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(s); }).listen(port, () => console.log('serving', root, port));
