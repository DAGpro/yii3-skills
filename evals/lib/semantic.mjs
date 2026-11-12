// Semantic analysis helpers for scenario checks (external-audit P1, 2026-11-12).
// Upgrades pattern-presence checks to semantic relations: call order, schema-operation
// pairing, DI binding targets, validator-attribute attachment, with a comment-only
// source strip so docblock mentions never satisfy a semantic gate. Behavioral proof
// stays L3 (runtime-harness / PHPUnit); each check's contract records that boundary
// in evals/CHECK-CONTRACTS.md.
import { matchParen, matchBrace, matchDelimiter, methodBody, stripPhpNoise, skipQuotedString, phpHeredocEnd } from './checks.mjs';

/**
 * Blanks PHP comments (line, block, and non-attribute `#`) with spaces; string
 * literals and heredoc bodies are PRESERVED - use this when the check must read
 * values that live in strings (migration table names, DI array syntax) while
 * still refusing to honor comment mentions.
 */
export function stripPhpComments(text) {
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
      i = skipQuotedString(text, i);
      continue;
    }
    if (ch === '<' && next === '<' && text[i + 2] === '<') {
      const end = phpHeredocEnd(text, i);
      if (end !== null && end > i) {
        i = end;
        continue;
      }
    }
    i++;
  }
  return out.join('');
}

// --- call argument extraction -------------------------------------------------

/** Splits a call-argument string on top-level commas; strings and nested parens survive. */
function splitArgs(argsText) {
  const parts = [];
  let depth = 0;
  let start = 0;
  let inS = null;
  for (let i = 0; i < argsText.length; i++) {
    const ch = argsText[i];
    if (inS) {
      if (ch === '\\') i++;
      else if (ch === inS) inS = null;
      continue;
    }
    if (ch === '\'' || ch === '"') { inS = ch; continue; }
    if (ch === '(' || ch === '[') depth++;
    else if (ch === ')' || ch === ']') depth--;
    else if (ch === ',' && depth === 0) {
      parts.push(argsText.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(argsText.slice(start));
  return parts.map((p) => p.trim()).filter((p) => p.length > 0);
}

/** Extracts every `->fn(...)` call in the text: { fn, named: {k: raw}, positional: [raw...] }.
 *  Comments are stripped first - a commented-out call is not a call (audit mutant probe). */
export function extractCalls(body) {
  const src = stripPhpComments(body);
  const calls = [];
  for (const m of src.matchAll(/->\s*([A-Za-z_]\w*)\s*\(/g)) {
    const open = src.indexOf('(', m.index);
    const close = matchParen(src, open);
    if (close === -1) continue;
    const named = {};
    const positional = [];
    for (const arg of splitArgs(src.slice(open + 1, close))) {
      const nm = /^([A-Za-z_]\w*)\s*:\s*([\s\S]+)$/.exec(arg);
      if (nm) named[nm[1]] = nm[2].trim();
      else positional.push(arg);
    }
    calls.push({ fn: m[1], named, positional });
  }
  return calls;
}

/** File-level `const NAME = 'value'` map (visibility modifiers allowed). */
const constMap = (fileText) => {
  const map = {};
  for (const m of fileText.matchAll(/(?:^|\s)(?:public\s+|private\s+|protected\s+)?const\s+([A-Za-z_]\w*)\s*=\s*'([^']*)'/g)) {
    map[m[1]] = m[2];
  }
  return map;
};

/** Resolves a raw argument to a string: 'literal' | "literal" | (self|Class)::CONST, else null. */
export function resolveScalar(raw, fileText = '') {
  const v = (raw ?? '').trim();
  const lit = /^(['"])([\s\S]*)\1$/.exec(v);
  if (lit) return lit[2];
  const cnst = /^(?:[A-Za-z_][\w\\]*::)?([A-Za-z_]\w*)$/.exec(v);
  if (cnst && /::/.test(v)) {
    const map = constMap(fileText);
    if (cnst[1] in map) return map[cnst[1]];
  }
  return null;
}

// --- migration operation pairing ----------------------------------------------

const normTable = (t) => (t ?? '').replace(/^\{\{%/, '').replace(/%\}\}$/, '');
const SCHEMA_OPS = new Set(['createTable', 'dropTable', 'addColumn', 'dropColumn', 'renameTable', 'renameColumn', 'addIndex', 'dropIndex', 'addPrimaryKey', 'dropPrimaryKey', 'addForeignKey', 'dropForeignKey']);

function collectSchemaOps(body, resolve) {
  const ops = [];
  if (!body) return ops;
  for (const c of extractCalls(body)) {
    if (!SCHEMA_OPS.has(c.fn)) continue;
    const at = (i, key) => resolve(c.positional[i] ?? (key !== undefined ? c.named[key] : undefined));
    switch (c.fn) {
      case 'createTable':
      case 'dropTable':
      case 'addIndex':
      case 'dropIndex':
      case 'addPrimaryKey':
      case 'dropPrimaryKey':
      case 'addForeignKey':
      case 'dropForeignKey':
        ops.push({ kind: c.fn, table: at(0, 'table') });
        break;
      case 'addColumn':
      case 'dropColumn':
        ops.push({ kind: c.fn, table: at(0, 'table'), column: at(1, 'column') });
        break;
      case 'renameTable':
        ops.push({ kind: c.fn, from: at(0, 'from'), to: at(1, 'to') });
        break;
      case 'renameColumn':
        ops.push({ kind: c.fn, table: at(0, 'table'), from: at(1, 'from'), to: at(2, 'to') });
        break;
    }
  }
  return ops;
}

function inverseMatches(op, d) {
  const pairs = { createTable: 'dropTable', addColumn: 'dropColumn', addIndex: 'dropIndex', addPrimaryKey: 'dropPrimaryKey', addForeignKey: 'dropForeignKey' };
  const inv = pairs[op.kind];
  if (!inv || d.kind !== inv) return false;
  if (op.table === null || d.table === null || normTable(op.table) !== normTable(d.table)) return false;
  if (op.kind === 'addColumn' && (op.column === null || d.column === null || op.column !== d.column)) return false;
  return true;
}

/**
 * Pairs every recognized schema operation in `upBody` with its inverse in `downBody`
 * (same normalized identifiers; positional or named arguments; class constants are
 * resolved against `fileText`). Unresolvable/dynamic identifiers are reported as
 * missing so a migration with a dynamic table cannot slip through.
 */
export function migrationPairAnalysis(upBody, downBody, fileText = '') {
  const resolve = (raw) => resolveScalar(raw, fileText);
  const upOps = collectSchemaOps(upBody, resolve);
  const downOps = collectSchemaOps(downBody, resolve);
  const missing = upOps
    .filter((op) => !downOps.some((d) => inverseMatches(op, d)))
    .map((op) => (op.kind === 'addColumn'
      ? `addColumn(${op.table ?? 'unresolvable'}, ${op.column ?? 'unresolvable'})`
      : `${op.kind}(${op.table ?? 'unresolvable'})`));
  return { recognized: upOps.length, missing };
}

// --- dispatch / transaction order ------------------------------------------------

/** Named method bodies (closures are covered by their enclosing method's span). */
function methodScopes(text) {
  const scopes = [];
  for (const m of text.matchAll(/function\s+[A-Za-z_]\w*\s*\([^)]*\)[^{;]*\{/g)) {
    const open = text.indexOf('{', m.index);
    const close = matchBrace(text, open);
    if (close !== -1) scopes.push(text.slice(open, close + 1));
  }
  return scopes.length ? scopes : [text];
}

/**
 * Violations of the post-commit dispatch rule in one file: a dispatch() inside a
 * transaction() closure, or a dispatch() positioned before the transaction() begins
 * within the same method (the event would fire even if the transaction failed).
 * Files where dispatch and transaction live in different classes (layered design)
 * have no co-located scope and yield no violations - that boundary is proven at L3.
 */
export function dispatchOrderViolations(rawText) {
  const t = stripPhpNoise(rawText);
  const violations = [];
  for (const body of methodScopes(t)) {
    const txs = [...body.matchAll(/->\s*transaction\s*\(/g)]
      .map((m) => {
        const open = body.indexOf('(', m.index);
        return { open, close: matchParen(body, open) };
      })
      .filter((x) => x.close !== -1);
    const dispatches = [...body.matchAll(/->\s*dispatch\s*\(/g)].map((m) => m.index);
    if (!txs.length || !dispatches.length) continue;
    const firstOpen = Math.min(...txs.map((x) => x.open));
    for (const d of dispatches) {
      if (txs.some((x) => d > x.open && d < x.close)) {
        violations.push('dispatch inside the transaction() closure');
      } else if (d < firstOpen) {
        violations.push('dispatch before transaction() in the same method (the event must fire after the commit)');
      }
    }
  }
  return violations;
}

// --- DI binding parsing -----------------------------------------------------------

/** Normalizes a parsed class reference: no leading backslash. */
const normClass = (s) => s.replace(/^\\/, '');

/**
 * Parses DI definition files into `{ id, target }` binding pairs. Only binding
 * positions count (array keys mapping to a class, or Reference chains); mentions
 * anywhere else are ignored because comments are stripped first. Supported shapes:
 *   X::class => Y::class | ['class' => Y::class] | Reference::to(Y::class) | 'App\Class'
 *   Reference::to(X::class)->to(Y::class)   StaticReference::to(X::class)->to(Y::class)
 */
export function parseDiBindings(diText) {
  const t = stripPhpComments(diText);
  const bindings = [];
  const push = (id, target) => {
    if (id && target) bindings.push({ id: normClass(id), target: normClass(target) });
  };
  for (const m of t.matchAll(/([A-Za-z_][\w\\]*)::class\s*=>\s*\[\s*['"]class['"]\s*=>\s*[\\]?[\w\\]*?([A-Za-z_]\w*)::class/g)) {
    push(m[1], m[2]);
  }
  for (const m of t.matchAll(/([A-Za-z_][\w\\]*)::class\s*=>\s*Reference\s*::\s*to\(\s*[\\]?[\w\\]*?([A-Za-z_]\w*)::class/g)) {
    push(m[1], m[2]);
  }
  for (const m of t.matchAll(/([A-Za-z_][\w\\]*)::class\s*=>\s*'([\\w\\\\]+)'/g)) {
    push(m[1], m[2]);
  }
  for (const m of t.matchAll(/([A-Za-z_][\w\\]*)::class\s*=>\s*[\\]?[\w\\]*?([A-Za-z_]\w*)::class/g)) {
    push(m[1], m[2]);
  }
  for (const m of t.matchAll(/::to\(\s*[\\]?[\w\\]*?([A-Za-z_]\w*)::class\s*\)\s*->\s*to\(\s*[\\]?[\w\\]*?([A-Za-z_]\w*)::class/g)) {
    push(m[1], m[2]);
  }
  // first binding for an id wins (a later duplicate cannot repair an earlier gap)
  const seen = new Set();
  return bindings.filter((b) => (seen.has(b.id) ? false : (seen.add(b.id), true)));
}

// --- validator attribute attachment --------------------------------------------------

const RULE_ATTR = /#\[\s*(?:Validate\s*\(|(?:Length|Integer|Required|Number|StringValue|Count|Email|HasLength|Boolean|DateTime|Callback)\b[\s(])/;
const PROPERTY_NEXT = /\s*(?:public|protected|private)\s+(?:(?:readonly\s+)?[A-Za-z_][\w\\]*\s+)?\$[A-Za-z_]\w*/y;

/**
 * Verifies that validator rule attributes are attached to property declarations.
 * Returns { total, detached } where detached names the attributes that float free
 * (e.g. a rule attribute above a class or a method - declared but governing nothing).
 * Class-level attributes (#[FromBody] and friends) are not rule attributes and are
 * not counted.
 */
export function ruleAttributeAttachment(commentStrippedText) {
  const t = commentStrippedText;
  let total = 0;
  const detached = [];
  let i = 0;
  while ((i = t.indexOf('#[', i)) !== -1) {
    const open = i + 1;
    const close = matchDelimiter(t, open, '[', ']');
    if (close === -1) break;
    const groupEnd = close + 1;
    const group = t.slice(i, groupEnd);
    if (RULE_ATTR.test(group)) {
      total++;
      let probe = groupEnd;
      // chained attributes: #[A]\n#[B]\npublic ... - skip further attribute groups before the property
      for (;;) {
        const rest = t.slice(probe);
        const ws = (rest.match(/^\s*/) ?? [''])[0].length;
        if (rest[ws] !== '#') break;
        const nextClose = matchDelimiter(t, probe + ws + 1, '[', ']');
        if (nextClose === -1) {
          probe = t.length;
          break;
        }
        probe = nextClose + 1;
      }
      PROPERTY_NEXT.lastIndex = probe;
      if (!PROPERTY_NEXT.test(t)) detached.push(group.replace(/\s+/g, ' ').trim());
    }
    i = groupEnd;
  }
  return { total, detached };
}
