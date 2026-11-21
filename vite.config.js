import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { defineConfig } from 'vite';

function listFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? listFiles(full) : [full];
  });
}

// Injects a content hash (BUILD_ID) and the precache list into dist/sw.js.
// JXL_BUILD_SALT lets tests produce two distinct "versions" from one source.
function pwaPrecachePlugin() {
  let outDir;
  return {
    name: 'jxl-pwa-precache',
    apply: 'build',
    configResolved(config) {
      outDir = join(config.root, config.build.outDir);
    },
    closeBundle() {
      const files = listFiles(outDir)
        .map((file) => relative(outDir, file).split(sep).join('/'))
        .filter((file) => file !== 'sw.js' && !file.endsWith('.map'))
        .sort();
      const hash = createHash('sha256');
      hash.update(process.env.JXL_BUILD_SALT ?? '');
      for (const file of files) {
        hash.update(file);
        hash.update(readFileSync(join(outDir, file)));
      }
      const buildId = hash.digest('hex').slice(0, 12);
      const swPath = join(outDir, 'sw.js');
      const source = readFileSync(swPath, 'utf8');
      if (!source.includes('__BUILD_ID__') || !source.includes('/*__PRECACHE__*/')) {
        throw new Error('sw.js placeholders not found');
      }
      writeFileSync(
        swPath,
        source.replace('__BUILD_ID__', buildId).replace('/*__PRECACHE__*/ []', JSON.stringify(files)),
      );
    },
  };
}

// Relative base keeps the app working on GitHub Pages under a repository
// subpath as well as on the root of any static host.
export default defineConfig({
  base: './',
  plugins: [pwaPrecachePlugin()],
  build: {
    outDir: 'dist',
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 1000,
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
  },
});
