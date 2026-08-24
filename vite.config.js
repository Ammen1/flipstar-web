import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';

// The mini-program web-view loads index.html from the local package, but
// Macle does NOT serve the sibling assets/ directory, so an external
// <script src="./assets/index.js"> 404s and React never mounts (blank page).
// Fix: produce a self-contained index.html by (1) downgrading the ES module
// entry to a classic script (IIFE bundle) and (2) inlining the bundle so
// there are no external asset requests at all.
function selfContainedHtmlForWebview() {
  return {
    name: 'self-contained-html-for-webview',
    closeBundle() {
      const htmlPath = resolve(__dirname, 'dist', 'index.html');
      const jsPath = resolve(__dirname, 'dist', 'assets', 'index.js');
      if (!existsSync(htmlPath)) return;
      let html = readFileSync(htmlPath, 'utf-8')
        .replace(/\s+type="module"/g, '')
        .replace(/\s+crossorigin(?:="[^"]*")?/g, '');
      if (existsSync(jsPath)) {
        // Escape any "</script>" occurrences so they don't terminate the tag.
        const js = readFileSync(jsPath, 'utf-8').replace(
          /<\/script>/gi,
          '<\\/script>',
        );
        html = html.replace(
          /<script[^>]*src="[^"]*assets\/index\.js"[^>]*><\/script>/i,
          () => '<script>\n' + js + '\n</script>',
        );
      }
      writeFileSync(htmlPath, html);
    },
  };
}

// Copy Macle/mini-program config files into the build output so the
// simulator (which serves from dist/) can find them and not 404.
function copyMacleConfigs() {
  const files = [
    'app-config.json',
    'project.config.json',
    'app.json',
    'index.maml',
    'index.js',
    'index.json',
  ];
  return {
    name: 'copy-macle-configs',
    closeBundle() {
      for (const f of files) {
        const src = resolve(__dirname, f);
        if (existsSync(src)) {
          copyFileSync(src, resolve(__dirname, 'dist', f));
        }
      }
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [react(), selfContainedHtmlForWebview(), copyMacleConfigs()],
  publicDir: 'public',
  server: {
    port: 5173,
    open: true,
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: false,
    minify: 'terser',
    cssCodeSplit: true,
    cssMinify: true,
    reportCompressedSize: false,
    target: 'es2015',
    rollupOptions: {
      output: {
        format: 'iife',
        entryFileNames: 'assets/[name].js',
        chunkFileNames: 'assets/[name].js',
        assetFileNames: 'assets/[name].[ext]',
      },
    },
    terserOptions: {
      compress: {
        drop_console: false,
        drop_debugger: false,
        pure_funcs: [],
        passes: 1,
      },
      mangle: false,
      format: {
        comments: false,
      },
    },
    chunkSizeWarningLimit: 600,
  },
  // Pre-bundle critical deps for faster dev & prod loads
  optimizeDeps: {
    include: ['react', 'react-dom', 'lucide-react'],
  },
});
