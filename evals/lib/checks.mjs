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

/** Index where a PHP heredoc/nowdoc starting at `i` (`<<<LABEL`) ends (past the closing label), or null. */
function phpHeredocEnd(text, i) {
  if (text[i] !== '<' || text[i + 1] !== '<' || text[i + 2] !== '<') return null;
  const m = /^<<<[ \t]*(?:'([A-Za-z_][A-Za-z0-9_]*)'|"([A-Za-z_][A-Za-z0-9_]*)"|([A-Za-z_][A-Za-z0-9_]*))/.exec(text.slice(i, i + 96));
  if (!m) return null;
  const label = m[1] || m[2] || m[3];
  const closeRe = new RegExp(`^[ \\t]*${label}(?![A-Za-z0-9_])`, 'm');
  const close = closeRe.exec(text.slice(i + m[0].length));
  if (!close) return text.length; // unterminated heredoc: PHP would not parse; treat the rest as noise
  return i + m[0].length + close.index + close[0].length;
}

/** Skips a PHP single/double-quoted string starting at the opening quote; returns the index past the closing quote. */
function skipQuotedString(text, start) {
  let i = start + 1;
  const n = text.length;
  while (i < n) {
    const ch = text[i];
    if (ch === '\\') {
      i += 2; // consume the escape pair ('\\'', '\\\\', '\\"', ...) - the quote after an odd backslash run must not close
      continue;
    }
    if (ch === text[start]) return i + 1;
    i++;
  }
  return n; // unterminated string: PHP would not parse; treat the rest as noise
}

/** State-machine based delimiter matcher ignoring PHP comments, string literals, and heredocs. */
function matchDelimiter(text, openIdx, openChar, closeChar) {
  let depth = 0;
  let i = openIdx;
  const n = text.length;
  while (i < n) {
    const ch = text[i];
    const next = i + 1 < n ? text[i + 1] : '';

    // Comments ('#' only outside attributes: `#[...]` is PHP 8 attribute syntax)
    if (ch === '/' && next === '/') {
      const nl = text.indexOf('\n', i);
      i = nl === -1 ? n : nl + 1;
      continue;
    }
    if (ch === '#' && next !== '[') {
      const nl = text.indexOf('\n', i);
      i = nl === -1 ? n : nl + 1;
      continue;
    }
    if (ch === '/' && next === '*') {
      const close = text.indexOf('*/', i + 2);
      i = close === -1 ? n : close + 2;
      continue;
    }

    // Strings (escape-pair aware) and heredocs
    if (ch === '\'' || ch === '"') {
      i = skipQuotedString(text, i);
      continue;
    }
    if (ch === '<' && next === '<' && text[i + 2] === '<') {
      const end = phpHeredocEnd(text, i);
      if (end !== null) {
        i = end;
        continue;
      }
    }

    // Count delimiters
    if (ch === openChar) {
      depth++;
    } else if (ch === closeChar) {
      depth--;
      if (depth === 0) return i;
    }
    i++;
  }
  return -1;
}

/**
 * Blanks PHP comments, string literals, and heredoc bodies with spaces (offset- and
 * line-preserving) so text-level pattern checks do not match inside noise: docblock
 * mentions, string contents, and `'\\'`-style escapes no longer produce false hits.
 * Used by the shared hygiene checks in shared-checks.mjs.
 */
export function stripPhpNoise(text) {
  const out = text.split('');
  const n = text.length;
  const blank = (from, to) => {
    for (let k = from; k < to && k < n; k++) {
      if (out[k] !== '\n' && out[k] !== '\r') out[k] = ' ';
    }
  };
  let i = 0;
  while (i < n) {
    const ch = text[i];
    const next = i + 1 < n ? text[i + 1] : '';
    if (ch === '/' && next === '/') {
      const nl = text.indexOf('\n', i);
      blank(i, nl === -1 ? n : nl);
      i = nl === -1 ? n : nl;
      continue;
    }
    if (ch === '#' && next !== '[') {
      const nl = text.indexOf('\n', i);
      blank(i, nl === -1 ? n : nl);
      i = nl === -1 ? n : nl;
      continue;
    }
    if (ch === '/' && next === '*') {
      const close = text.indexOf('*/', i + 2);
      const end = close === -1 ? n : close + 2;
      blank(i, end);
      i = end;
      continue;
    }
    if (ch === '\'' || ch === '"') {
      const end = skipQuotedString(text, i);
      blank(i, end);
      i = end;
      continue;
    }
    if (ch === '<' && next === '<' && text[i + 2] === '<') {
      const end = phpHeredocEnd(text, i);
      if (end !== null && end > i) {
        blank(i, end);
        i = end;
        continue;
      }
    }
    i++;
  }
  return out.join('');
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

export const check = (id, description, run, { required = true, category = 'invariant' } = {}) =>
  ({ id, description, required, run, category });
export const ok = (evidence = '') => ({ pass: true, evidence });
export const fail = (evidence = '') => ({ pass: false, evidence });

/**
 * Validates a fenced ```aif-gate-result code block according to the AI Factory 2.x schema.
 * Options:
 *  - expectedStatus: 'pass' | 'fail' | 'warn' | null (if null, allows any of 'pass' | 'warn' | 'fail')
 *  - terminal: boolean (default true; requires gate block to be the terminal block)
 */
export function validateAifGateResult(transcript, { expectedStatus = 'pass', terminal = true } = {}) {
  const regex = /```aif-gate-result\s*\r?\n([\s\S]*?)\r?\n```/g;
  let match;
  let lastMatch = null;
  let lastJson = null;
  while ((match = regex.exec(transcript)) !== null) {
    lastMatch = match;
    lastJson = match[1].trim();
  }
  if (!lastJson || !lastMatch) {
    return fail('no valid ```aif-gate-result fenced code block found in transcript');
  }

  // Verify the block is terminal (final block in transcript)
  if (terminal) {
    const trailingContent = transcript.slice(lastMatch.index + lastMatch[0].length).trim();
    if (trailingContent.length > 0) {
      return fail(`aif-gate-result must be the final block; found trailing content: "${trailingContent.slice(0, 50)}..."`);
    }
  }

  try {
    const parsed = JSON.parse(lastJson);
    if (parsed.schema_version !== 1) return fail(`expected schema_version 1, got ${parsed.schema_version}`);
    if (parsed.gate !== 'verify') return fail(`expected gate "verify", got ${parsed.gate}`);
    if (!['pass', 'warn', 'fail'].includes(parsed.status)) return fail(`invalid status: ${parsed.status}`);
    if (typeof parsed.blocking !== 'boolean') return fail(`expected blocking boolean, got ${typeof parsed.blocking}`);
    if (!Array.isArray(parsed.blockers)) return fail('blockers must be an array');
    if (!Array.isArray(parsed.affected_files)) return fail('affected_files must be an array');

    // Validate blockers structure and reject unsupported keys (e.g. line)
    const ALLOWED_BLOCKER_KEYS = new Set(['id', 'severity', 'file', 'summary']);
    for (const b of parsed.blockers) {
      if (!b.id || typeof b.id !== 'string') return fail(`blocker missing string id: ${JSON.stringify(b)}`);
      if (!['error', 'warning'].includes(b.severity)) return fail(`blocker invalid severity: ${b.severity}`);
      if (!b.summary || typeof b.summary !== 'string') return fail(`blocker missing string summary: ${JSON.stringify(b)}`);
      if (b.file !== undefined && typeof b.file !== 'string') return fail(`blocker file must be string: ${JSON.stringify(b)}`);
      for (const k of Object.keys(b)) {
        if (!ALLOWED_BLOCKER_KEYS.has(k)) {
          return fail(`blocker contains unsupported key "${k}": ${JSON.stringify(b)}`);
        }
      }
    }

    // Validate suggested_next allowlist and reason requirement
    const ALLOWED_COMMANDS = ['/aif-fix', '/aif-rules', '/aif-architecture', '/aif-roadmap', '/aif-commit', null];
    if (!parsed.suggested_next || typeof parsed.suggested_next !== 'object') {
      return fail('suggested_next must be an object');
    }
    if (!ALLOWED_COMMANDS.includes(parsed.suggested_next.command)) {
      return fail(`suggested_next.command "${parsed.suggested_next.command}" not in allowlist: ${ALLOWED_COMMANDS.join(', ')}`);
    }
    if (parsed.suggested_next.reason === undefined) {
      return fail('suggested_next missing required "reason" property');
    }
    if (typeof parsed.suggested_next.reason !== 'string' && parsed.suggested_next.reason !== null) {
      return fail('suggested_next.reason must be a string or null');
    }

    // General status and blocking/blockers consistency (per AGENTS.md §4.7)
    if (parsed.status === 'fail') {
      if (parsed.blocking !== true) return fail(`status "fail" requires blocking: true, got ${parsed.blocking}`);
      if (parsed.blockers.length === 0) return fail('status "fail" requires non-empty blockers array');
    } else if (parsed.status === 'pass' || parsed.status === 'warn') {
      if (parsed.blocking !== false) return fail(`status "${parsed.status}" requires blocking: false, got ${parsed.blocking}`);
      if (parsed.blockers.length > 0) return fail(`status "${parsed.status}" requires empty blockers array, got ${parsed.blockers.length} blocker(s)`);
    }

    if (expectedStatus === 'pass') {
      if (parsed.status !== 'pass') return fail(`expected status pass, got ${parsed.status}`);
      if (parsed.blocking !== false) return fail(`expected blocking false for pass, got ${parsed.blocking}`);
      if (parsed.blockers.length > 0) return fail(`expected empty blockers for pass, got ${JSON.stringify(parsed.blockers)}`);
      if (parsed.affected_files.length === 0) return fail('affected_files should record evaluated files');
      if (parsed.suggested_next.command !== '/aif-commit') {
        return fail(`expected suggested_next.command "/aif-commit", got ${parsed.suggested_next.command}`);
      }
    } else if (expectedStatus === 'fail') {
      if (parsed.status !== 'fail') return fail(`expected status fail, got ${parsed.status}`);
      if (parsed.blocking !== true) return fail(`expected blocking true for fail, got ${parsed.blocking}`);
      if (parsed.blockers.length === 0) return fail('expected non-empty blockers for fail');
      if (parsed.suggested_next.command !== '/aif-fix') {
        return fail(`expected suggested_next.command "/aif-fix", got ${parsed.suggested_next.command}`);
      }
    } else if (expectedStatus === 'warn') {
      if (parsed.status !== 'warn') return fail(`expected status warn, got ${parsed.status}`);
      if (parsed.blocking !== false) return fail(`expected blocking false for warn, got ${parsed.blocking}`);
      if (parsed.suggested_next.command !== '/aif-commit') {
        return fail(`expected suggested_next.command "/aif-commit", got ${parsed.suggested_next.command}`);
      }
    }

    return ok();
  } catch (e) {
    return fail(`invalid aif-gate-result JSON: ${e.message}`);
  }
}

export {
  detectPhpToolchain,
  lintPhpFile,
  lintPhpFiles,
  validateComposerJson,
  validateComposerLock,
  isStubComposerLock,
  execComposer,
  parsePhpUnitSummary,
  resolvePhpUnitBinary,
  hasPhpUnitConfig,
  runPhpUnit,
  runRuntimeEvaluation,
  ensurePrewarmedVendor,
} from './runtime.mjs';
