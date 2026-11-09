// Shared helpers for scenario checks.mjs files. node:* stdlib only.
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { createHash } from 'node:crypto';

const SKIP = ['vendor', 'node_modules'];

export function walk(dir) {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    // Dot-entries are tooling/agent state (.git, skill install dirs, ...) — never task work.
    // Exception: .ai-factory is the operational control center of AI Factory projects.
    // Exception: .php-cs-fixer* are code style configuration files.
    if ((name.startsWith('.') && name !== '.ai-factory' && !name.startsWith('.php-cs-fixer')) || SKIP.includes(name)) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

export const rel = (root, p) => relative(root, p).replace(/\\/g, '/');
export const read = (p) => readFileSync(p, 'utf8');
const sha = (p) => createHash('sha1').update(readFileSync(p)).digest('hex');

/** Files added or modified by the agent relative to the fixture. */
export function changedFiles(dir, base) {
  const before = new Map(walk(base).map((p) => [rel(base, p), sha(p)]));
  const res = [];
  for (const p of walk(dir)) {
    const r = rel(dir, p);
    if (before.get(r) !== sha(p)) res.push({ path: r, abs: p, added: !before.has(r) });
  }
  return res;
}

/** All files in the tree whose relative path matches the regex. */
export const filesMatching = (dir, re) => walk(dir).filter((p) => re.test(rel(dir, p)));

/** Index of the closing paren for an opening one at openIdx (ignores strings/comments: heuristic). */
export function matchParen(text, openIdx) {
  let depth = 0;
  for (let i = openIdx; i < text.length; i++) {
    if (text[i] === '(') depth++;
    else if (text[i] === ')' && --depth === 0) return i;
  }
  return -1;
}

/** Index of the closing brace for an opening one at openIdx (depth-counting heuristic). */
export function matchBrace(text, openIdx) {
  let depth = 0;
  for (let i = openIdx; i < text.length; i++) {
    if (text[i] === '{') depth++;
    else if (text[i] === '}' && --depth === 0) return i;
  }
  return -1;
}

/** Body of `function <name>(...) { ... }` (brace-counting heuristic), or null. */
export function methodBody(text, methodName) {
  const m = new RegExp(`function\\s+${methodName}\\s*\\([^)]*\\)[^{]*\\{`, 'i').exec(text);
  if (!m) return null;
  const open = text.indexOf('{', m.index);
  const close = matchBrace(text, open);
  return close === -1 ? null : text.slice(open, close + 1);
}

export const check = (id, description, run, { required = true } = {}) => ({ id, description, required, run });
export const ok = (evidence = '') => ({ pass: true, evidence });
export const fail = (evidence = '') => ({ pass: false, evidence });

export {
  detectPhpToolchain,
  lintPhpFile,
  lintPhpFiles,
  validateComposerJson,
  runPhpUnit,
  runRuntimeEvaluation,
} from './runtime.mjs';
