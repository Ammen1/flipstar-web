/**
 * End-to-end camera tests in a real browser.
 *
 *   npm run test:browser          (CHROME_PATH=... to pick the browser)
 *
 * Bundles tests/browser/harness.jsx -- which mounts the real
 * EnhancedPostPage -- with the esbuild that ships inside Vite, serves it
 * from a local server that also stubs the API, and runs it in headless
 * Chrome or Edge with Chromium's fake camera and microphone. The page posts
 * its results back and this script prints them.
 *
 * No new dependencies: esbuild is already in node_modules (Vite uses it) and
 * the browser is whatever Chromium the machine has.
 */

import http from 'node:http';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const TIMEOUT_MS = Number(process.env.BROWSER_TEST_TIMEOUT_MS || 240000);

function findBrowser() {
  const candidates = [
    process.env.CHROME_PATH,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ].filter(Boolean);
  return candidates.find((p) => existsSync(p));
}

function readBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
  });
}

/** Field names, file names, types and sizes of a multipart body. */
function summariseMultipart(contentType, body) {
  const m = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType || '');
  if (!m) return { fields: {}, files: [] };
  const boundary = Buffer.from(`--${m[1] || m[2]}`);
  const out = { fields: {}, files: [] };
  let start = body.indexOf(boundary);
  while (start !== -1) {
    const next = body.indexOf(boundary, start + boundary.length);
    if (next === -1) break;
    const part = body.subarray(start + boundary.length + 2, next - 2);
    const split = part.indexOf('\r\n\r\n');
    if (split !== -1) {
      const head = part.subarray(0, split).toString('utf8');
      const content = part.subarray(split + 4);
      const name = /name="([^"]*)"/.exec(head)?.[1];
      const filename = /filename="([^"]*)"/.exec(head)?.[1];
      const type = /Content-Type:\s*([^\r\n]+)/i.exec(head)?.[1] || '';
      if (filename !== undefined) out.files.push({ name, filename, type, size: content.length });
      else if (name) out.fields[name] = content.toString('utf8');
    }
    start = next;
  }
  return out;
}

async function bundle(apiBase) {
  const result = await build({
    entryPoints: [path.join(ROOT, 'tests/browser/harness.jsx')],
    bundle: true,
    write: false,
    format: 'iife',
    platform: 'browser',
    target: 'es2019',
    jsx: 'automatic',
    loader: { '.js': 'jsx', '.png': 'dataurl', '.jpg': 'dataurl', '.svg': 'dataurl', '.gif': 'dataurl', '.webp': 'dataurl' },
    define: {
      'import.meta.env': JSON.stringify({
        VITE_API_BASE_URL: apiBase,
        VITE_ENVIRONMENT: 'test',
        MODE: 'test',
        DEV: false,
        PROD: true,
      }),
      'process.env.NODE_ENV': '"development"',
    },
    logLevel: 'error',
  });
  return result.outputFiles[0].text;
}

async function main() {
  const browser = findBrowser();
  if (!browser) {
    console.error('No Chrome or Edge found. Set CHROME_PATH to a Chromium-based browser.');
    process.exit(2);
  }

  const state = { uploads: [], failUpload: false };
  let resolveResults;
  const results = new Promise((resolve) => { resolveResults = resolve; });
  let html = '';

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const body = await readBody(req);
    const json = (code, obj) => {
      res.writeHead(code, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(obj));
    };
    if (url.pathname === '/') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
      return;
    }
    if (url.pathname === '/__log') {
      console.log(`  ${body.toString('utf8')}`);
      return json(200, {});
    }
    if (url.pathname === '/__results') {
      json(200, {});
      resolveResults(JSON.parse(body.toString('utf8')));
      return undefined;
    }
    if (url.pathname === '/__control') {
      state.failUpload = url.searchParams.get('failUpload') === '1';
      return json(200, {});
    }
    if (url.pathname === '/__uploads') return json(200, state.uploads);
    if (!url.pathname.startsWith('/api/v1/')) return json(404, {});

    // ── API stubs: just enough for the post page ──
    const route = url.pathname.slice('/api/v1'.length);
    if (route === '/client-log/') {
      // The page's own diagnostics; shown with VERBOSE=1.
      if (process.env.VERBOSE) {
        try {
          const entry = JSON.parse(body.toString('utf8'));
          console.log(`    · [${entry.source}/${entry.level}] ${entry.message}`);
        } catch (_) { /* not JSON */ }
      }
      return json(200, {});
    }
    if (route === '/crypto/public-key/') return json(404, {}); // E2E off: plain JSON
    if (route === '/categories/') return json(200, []);
    if (route === '/drafts/') return json(200, req.method === 'GET' ? [] : { id: 1 });
    if (route === '/coins/balance/') return json(200, { balance: 1000 });
    if (route === '/wallet/config/') return json(200, { cost_post_create_non_campaign: 0 });
    if (route === '/posts/create/') {
      state.uploads.push(summariseMultipart(req.headers['content-type'], body));
      if (state.failUpload) return json(500, {});
      return json(201, { id: 4242, media: '/media/reel.webm', created_at: new Date().toISOString() });
    }
    return json(200, {});
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  const origin = `http://127.0.0.1:${port}`;
  const script = await bundle(`${origin}/api/v1`);
  html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>camera e2e</title></head><body style="margin:0"><div id="root"></div><script>${script.replace(/<\/script>/gi, '<\\/script>')}</script></body></html>`;

  const profile = mkdtempSync(path.join(tmpdir(), 'flipstar-camera-e2e-'));
  const args = [
    '--headless=new',
    '--no-first-run',
    '--no-default-browser-check',
    `--user-data-dir=${profile}`,
    // Chromium's synthetic camera and microphone, and "Allow" for every prompt.
    '--use-fake-device-for-media-stream',
    '--use-fake-ui-for-media-stream',
    '--autoplay-policy=no-user-gesture-required',
    '--enable-unsafe-swiftshader',
    '--ignore-gpu-blocklist',
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding',
    // A phone-sized window, so the page takes its mobile layout.
    '--window-size=412,915',
    origin + '/',
  ];
  console.log(`browser: ${browser}`);
  const child = spawn(browser, args, { stdio: 'ignore' });

  const timer = setTimeout(() => resolveResults({ timeout: true, tests: [] }), TIMEOUT_MS);
  const outcome = await results;
  clearTimeout(timer);

  if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
  else child.kill('SIGKILL');
  server.close();
  try { rmSync(profile, { recursive: true, force: true }); } catch (_) { /* the browser may still hold it */ }

  if (outcome.timeout) {
    console.error(`\nTimed out after ${TIMEOUT_MS}ms.`);
    process.exit(1);
  }
  const failed = outcome.tests.filter((t) => !t.ok);
  const skipped = outcome.tests.filter((t) => t.skipped);
  const passed = outcome.tests.length - failed.length - skipped.length;
  console.log(`\n${passed}/${outcome.tests.length} passed${skipped.length ? `, ${skipped.length} skipped` : ''}`);
  failed.forEach((t) => console.log(`\n✘ ${t.name}\n${t.detail}`));
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
