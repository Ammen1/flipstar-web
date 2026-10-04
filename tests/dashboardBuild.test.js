// The staff dashboard's own build and server (dashboard-main.jsx,
// vite.dashboard.config.js, dashboard.default.conf).
//
// Cheap static checks that sit next to the guarantees that matter, which are
// server-side and live in the backend's tests. These hold the things a
// browser cannot be trusted to notice: a source map shipped, a secret put in
// a VITE_ variable, a security header silently dropped by nginx.

import assert from 'node:assert/strict';
import test from 'node:test';

import { read, sourceFiles } from './helpers/sourceFiles.js';

test('the dashboard entry mounts the admin app and nothing of the public shell', () => {
  const entry = read('dashboard-main.jsx');
  assert.match(entry, /import \{ AdminApp \} from '\.\/admin\/AdminApp'/);
  assert.match(entry, /<AdminApp \/>/);
  assert.doesNotMatch(entry, /router|RouterProvider|AuthProvider/);
  assert.match(read('dashboard.html'), /src="\/dashboard-main\.jsx"/);
});

test('the dashboard build never ships source maps', () => {
  const config = read('vite.dashboard.config.js');
  assert.match(config, /sourcemap:\s*false/);
  assert.match(config, /input:\s*\{\s*dashboard:\s*resolve\('dashboard\.html'\)/);
});

test('no build-time variable beyond the two public ones', () => {
  // Vite writes every VITE_* value into the JavaScript each browser
  // downloads. Adding a name here is a decision that its value is public.
  const allowed = new Set(['VITE_API_BASE_URL', 'VITE_ENVIRONMENT']);
  const used = new Set();
  for (const file of [...sourceFiles(), 'Dockerfile', 'Dockerfile.dashboard']) {
    for (const [name] of read(file).matchAll(/VITE_[A-Z0-9_]+/g)) used.add(name);
  }
  assert.deepEqual([...used].filter((name) => !allowed.has(name)), []);
});

// --- dashboard.default.conf ------------------------------------------------

const nginx = read('dashboard.default.conf')
  .split('\n')
  .map((line) => line.replace(/#.*/, ''))
  .join('\n');

/** Every add_header statement that sits inside a location block. */
function addHeadersInsideLocations(conf) {
  const blocks = [];
  const offenders = [];
  let statement = '';
  let quoted = false;
  for (const ch of conf) {
    if (ch === '"') quoted = !quoted;
    if (quoted) {
      statement += ch;
      continue;
    }
    if (ch === '{') {
      blocks.push(statement.trim().split(/\s+/)[0]);
      statement = '';
    } else if (ch === '}') {
      blocks.pop();
      statement = '';
    } else if (ch === ';') {
      if (/^add_header\b/.test(statement.trim()) && blocks.includes('location')) {
        offenders.push(statement.trim());
      }
      statement = '';
    } else {
      statement += ch;
    }
  }
  return offenders;
}

test('no location drops the security headers by declaring its own add_header', () => {
  // nginx does not merge add_header: one inside a location discards every
  // add_header inherited from the server block.
  assert.deepEqual(addHeadersInsideLocations(nginx), []);
  // ...and the check itself can see one.
  const broken = nginx.replace('location /assets/ {', 'location /assets/ { add_header X-Test "1";');
  assert.equal(addHeadersInsideLocations(broken).length, 1);
});

test('the dashboard refuses framing, sniffing and indexing on every response', () => {
  const header = (name) => {
    const m = nginx.match(new RegExp(`add_header\\s+${name}\\s+"([^"]+)"\\s+always;`));
    assert.ok(m, `${name} is set, with "always" so error pages carry it too`);
    return m[1];
  };
  const csp = header('Content-Security-Policy');
  for (const directive of [
    "default-src 'self'",
    "script-src 'self';",
    "connect-src 'self';",
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
  ]) {
    assert.ok(csp.includes(directive), `CSP has ${directive}`);
  }
  assert.doesNotMatch(csp, /script-src[^;]*'unsafe-(inline|eval)'/);
  assert.equal(header('X-Frame-Options'), 'DENY');
  assert.equal(header('X-Content-Type-Options'), 'nosniff');
  assert.match(header('X-Robots-Tag'), /noindex/);
  assert.match(nginx, /server_tokens off;/);
});

test('only content-hashed bundles are cached; the entry document never is', () => {
  const map = nginx.match(/map "\$status:\$uri" \$dashboard_cache_control \{([\s\S]*?)\}/);
  assert.ok(map, 'Cache-Control comes from the map, set once at server level');
  assert.match(map[1], /"~\^\(200\|304\):\/assets\/"\s+"public, max-age=31536000, immutable";/);
  assert.match(map[1], /default\s+"no-store";/);
});
