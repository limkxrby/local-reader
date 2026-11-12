import { build, context } from 'esbuild-wasm';
import { cp, mkdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import './assets.mjs';

const outdir = resolve('dist');
if (outdir !== resolve(process.cwd(), 'dist')) throw new Error('Unexpected output directory');
await rm(outdir, { recursive: true, force: true });
await mkdir(outdir, { recursive: true });
await cp('public', outdir, { recursive: true });
const shared = { absWorkingDir: process.cwd(), tsconfig: resolve('tsconfig.json'), bundle: true, target: 'chrome120', sourcemap: false, minify: true, outdir,
  define: { 'process.env.NODE_ENV': '"production"' }, logLevel: 'info' };
const configs = [
  { ...shared, entryPoints: { background: resolve('src/background.ts'), library: resolve('src/library.tsx') }, format: 'esm' },
  { ...shared, entryPoints: { extractor: resolve('src/extractor.ts') }, format: 'iife' },
];
if (process.argv.includes('--watch')) {
  for (const config of configs) await (await context(config)).watch();
  console.log('Watching source files. Reload the unpacked extension after changes. Public files require a build restart.');
} else {
  for (const config of configs) await build(config);
}
