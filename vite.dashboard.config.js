// Build for the private staff dashboard (dashboard.<domain>).
//
// Separate from vite.config.js on purpose. The main app has to be one IIFE
// inlined into index.html because the Macle mini-program web-view cannot load
// sibling assets -- which also meant every public visitor downloaded the whole
// admin dashboard inside the main bundle. The dashboard is only ever opened in
// a normal browser, so it builds as an ordinary ES-module app with its own
// output directory and none of the web-view workarounds.
//
// Run with `npm run build:dashboard`. Output: dist-dashboard/.
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { renameSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const OUT_DIR = 'dist-dashboard';

// The entry is dashboard.html so it cannot be confused with the public app's
// index.html in the source tree; nginx expects index.html at the root of the
// image, so it is renamed once the build is written. Reads the resolved
// outDir, so `--outDir` on the command line still works.
function serveEntryAsIndex() {
  let outDir = OUT_DIR;
  return {
    name: 'dashboard-entry-as-index',
    apply: 'build',
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir);
    },
    closeBundle() {
      const from = resolve(outDir, 'dashboard.html');
      if (existsSync(from)) renameSync(from, resolve(outDir, 'index.html'));
    },
  };
}

export default defineConfig({
  base: '/',
  plugins: [react(), serveEntryAsIndex()],
  // public/ holds the main app's mini-program configs; none belong here.
  publicDir: false,
  build: {
    outDir: OUT_DIR,
    emptyOutDir: true,
    assetsDir: 'assets',
    // Never: a source map hands the whole admin client, comments included,
    // to anyone who can reach the host.
    sourcemap: false,
    minify: 'terser',
    target: 'es2018',
    reportCompressedSize: false,
    rollupOptions: {
      input: { dashboard: resolve('dashboard.html') },
      output: {
        // Content-hashed, so nginx can cache them for a year and a deploy
        // can never serve a stale chunk under a fresh index.html.
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]',
      },
    },
    terserOptions: {
      compress: {
        drop_console: process.env.NODE_ENV === 'production',
        drop_debugger: true,
      },
      mangle: { keep_classnames: true, keep_fnames: true },
      format: { comments: false },
    },
    chunkSizeWarningLimit: 1500,
  },
});
