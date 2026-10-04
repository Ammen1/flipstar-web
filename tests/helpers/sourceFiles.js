/**
 * Reading the repository's own sources, for tests that check how files are
 * wired together rather than what a function returns.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';

export const root = new URL('../../', import.meta.url);

/** A file's text, by path relative to the repository root. */
export const read = (path) => readFileSync(new URL(path, root), 'utf8');

const SKIP_DIRS = new Set(['node_modules', 'dist', 'dist-dashboard', '.git', '.github']);

/** Every JS/JSX source file under `dir`, as paths relative to the repository root. */
export function sourceFiles(dir = '') {
  const out = [];
  for (const name of readdirSync(new URL(dir || './', root))) {
    if (SKIP_DIRS.has(name)) continue;
    const rel = dir + name;
    if (statSync(new URL(rel, root)).isDirectory()) out.push(...sourceFiles(`${rel}/`));
    else if (/\.(jsx?|mjs)$/.test(name) && !name.includes('.timestamp-')) out.push(rel);
  }
  return out;
}
