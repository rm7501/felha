import * as esbuild from 'esbuild';
import fs from 'fs';
const dev = process.argv.includes('--dev');
fs.mkdirSync('dist', { recursive: true });
await esbuild.build({
  entryPoints: { app: 'src/main.jsx' }, bundle: true, outdir: 'dist', format: 'esm', splitting: true,
  minify: !dev, sourcemap: dev, target: ['es2020', 'safari15', 'chrome90', 'firefox90'], jsx: 'automatic', jsxImportSource: 'preact',
  loader: { '.woff2': 'file', '.woff': 'file' }, assetNames: 'fonts/[name]-[hash]', chunkNames: 'chunks/[name]-[hash]',
  legalComments: 'none', logLevel: 'warning',
});
for (const f of ['index.html', 'dict-ar.txt']) fs.copyFileSync('public/' + f, 'dist/' + f);
const size = f => (fs.statSync('dist/' + f).size / 1024).toFixed(0) + 'KB';
console.log('built', fs.readdirSync('dist').map(f => f + (fs.statSync('dist/' + f).isFile() ? ' ' + size(f) : '/')).join(', '));
