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

/** State-machine based delimiter matcher ignoring PHP comments and string literals. */
function matchDelimiter(text, openIdx, openChar, closeChar) {
  let depth = 0;
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let inLineComment = false;
  let inBlockComment = false;

  for (let i = openIdx; i < text.length; i++) {
    const ch = text[i];
    const prev = i > 0 ? text[i - 1] : '';
    const next = i + 1 < text.length ? text[i + 1] : '';

    if (inLineComment) {
      if (ch === '\n') inLineComment = false;
      continue;
    }

    if (inBlockComment) {
      if (ch === '*' && next === '/') {
        inBlockComment = false;
        i++; // skip /
      }
      continue;
    }

    if (inSingleQuote) {
      if (ch === '\'' && prev !== '\\') inSingleQuote = false;
      continue;
    }

    if (inDoubleQuote) {
      if (ch === '"' && prev !== '\\') inDoubleQuote = false;
      continue;
    }

    // Check for comment starts
    if (ch === '/' && next === '/') {
      inLineComment = true;
      i++;
      continue;
    }
    if (ch === '#') {
      inLineComment = true;
      continue;
    }
    if (ch === '/' && next === '*') {
      inBlockComment = true;
      i++;
      continue;
    }

    // Check for string starts
    if (ch === '\'') {
      inSingleQuote = true;
      continue;
    }
    if (ch === '"') {
      inDoubleQuote = true;
      continue;
    }

    // Count delimiters
    if (ch === openChar) {
      depth++;
    } else if (ch === closeChar) {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/** Index of the closing paren for an opening one at openIdx (respects PHP strings & comments). */
export function matchParen(text, openIdx) {
  return matchDelimiter(text, openIdx, '(', ')');
}

/** Index of the closing brace for an opening one at openIdx (respects PHP strings & comments). */
export function matchBrace(text, openIdx) {
  return matchDelimiter(text, openIdx, '{', '}');
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
