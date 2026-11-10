#!/usr/bin/env node
// Grounding checker for the yii3 skill guides (Node >= 18, ESM, node:* stdlib only).
//
// Extracts `Yiisoft\...` FQCNs and `Class::method(` pairs from every guide under
// skills/yii3/references/*.md, then verifies them against the offline package
// clones in references/<pkg>/src (PSR-4 mapping from each clone's composer.json).
//
// Output: unconfirmed symbols (file:line), one summary line. Exit codes:
//   0 — all symbols confirmed, or no clones present (warning printed)
//   1 — at least one symbol could not be confirmed (see ALLOWLIST below)
//
// Short-name pairs (`Result::isPropertyValid(`) are resolved via the FQCNs
// mentioned in the same guide; ambiguous or unknown short names are skipped.

import { existsSync, readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, relative, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const guidesDir = join(root, 'skills', 'yii3', 'references');
const referencesDir = join(root, 'references');
const manifestPath = join(root, 'evals', 'data', 'api-symbols-manifest.json');
const shouldExportManifest = process.argv.includes('--export-manifest') || process.env.UPDATE_MANIFEST === '1';
const forceManifestMode = process.argv.includes('--manifest-mode');

// Allowlist of known-good non-confirmable symbols. Each entry: { match, reason }.
// `match` is a substring tested against "<FQCN or Class::method>@<guide-filename>".
// Every entry carries the reason the symbol cannot/should not be confirmed
// against references/*/src.
const ALLOWLIST = [
  // Intentional phantom-API warnings: the guide documents that these do NOT exist.
  { match: 'Yiisoft\\Strings\\Inflector::idToPascalCase()', reason: 'phantom method quoted in a warning; guide prescribes toPascalCase()' },
  { match: 'Yiisoft\\Cookies\\SameSite', reason: 'phantom enum quoted in anti-pattern row; guide prescribes Cookie::SAME_SITE_* constants' },
  { match: 'Yiisoft\\Cookies\\Cookie::create()', reason: 'phantom method quoted in anti-pattern row; constructor is the documented path' },
  { match: 'DropdownFilter::prompt()', reason: 'phantom method quoted in warning; prompt goes through the option array' },
  { match: 'Yiisoft\\Yii\\Http\\Middleware\\CorsMiddleware', reason: 'phantom class quoted in a "Hallucinating" anti-pattern row' },
  { match: 'Yiisoft\\Yii\\RateLimiter\\RateLimiterMiddleware', reason: 'phantom class quoted in a "Hallucinating" anti-pattern row; the real class is LimitRequestsMiddleware (verified in src)' },
  { match: 'CurrentRoute::getRoute()', reason: 'phantom method quoted in warnings; CurrentRoute exposes getName()/getPattern()/getArguments() (verified in src)' },
  { match: 'Yiisoft\\Router\\Attribute', reason: 'attribute classes exist only on the yiisoft/router dev-add-attributes branch required by router-composer-attribute-collector; the guide explains the version constraint in the same section' },
  { match: 'Yiisoft\\Router\\Provider\\RoutesProviderInterface', reason: 'interface lives on the yiisoft/router dev-add-attributes branch (imported by AttributeRoutesProvider), not in the stable router clone' },
  { match: 'Query::cache()', reason: 'the guide documents the ABSENCE of query result caching (§3.5); the method intentionally does not exist' },
  { match: 'Query::noCache()', reason: 'same — absence documented in §3.5' },
  { match: 'ActiveQuery::cache()', reason: 'same — absence documented in §3.5 warning rows' },
  { match: 'MigrationBuilder::checkIntegrity()', reason: 'phantom method quoted in a warning; MigrationBuilder has no integrity toggle (verified in src)' },
  { match: 'FileHelper::createDirectory()', reason: 'phantom method quoted in anti-pattern row; FileHelper::ensureDirectory() is the real API (verified in src)' },
  { match: 'FileHelper::exists()', reason: 'phantom method quoted in anti-pattern row' },
  { match: 'Yiisoft\\Form\\Widget\\Form', reason: 'phantom class quoted in anti-pattern rows; Html::form() is the real API' },
  { match: 'Yiisoft\\FormModel\\Attribute\\Label', reason: 'phantom class quoted in anti-pattern rows; #[Label] comes from Yiisoft\Validator' },
  { match: 'Yiisoft\\FormModel\\Field::widget()', reason: 'anti-pattern row about wrong instance invocation on the static factory' },
  { match: 'Yiisoft\\FormModel\\Field::submit()', reason: 'anti-pattern row quoting a non-existent Field factory method' },
  { match: 'Yiisoft\\FormModel\\Field::radio()', reason: 'anti-pattern row quoting a non-existent Field factory method' },
  { match: 'Yiisoft\\FormModel\\Field::reset()', reason: 'anti-pattern row quoting a non-existent Field factory method' },
  { match: 'Yiisoft\\FormModel\\Field::tel()', reason: 'anti-pattern row quoting a non-existent Field factory method' },
  { match: 'Yiisoft\\Html\\Html::decode()', reason: 'phantom method quoted in a warning; htmlspecialchars_decode() is prescribed instead' },
  { match: 'Yiisoft\\Log\\Level', reason: 'phantom class quoted in a warning ("There is no Yiisoft\\Log\\Level class"); LogLevel::* is prescribed' },
  { match: 'Yiisoft\\Queue\\Db\\migrations', reason: 'phantom namespace quoted in a warning; the queue-db migration is in the global namespace' },
  { match: 'Yiisoft\\Queue\\QueueInterface', reason: 'phantom interface quoted in an anti-pattern row; QueueProducerInterface/QueueConsumerInterface are the real contracts (verified in src)' },
  { match: 'Yiisoft\\ErrorHandler\\Factory\\ThrowableResponseFactory', reason: 'phantom namespace quoted in an anti-pattern row; the real class is Yiisoft\\ErrorHandler\\ThrowableResponseFactory (verified in src)' },
  { match: 'Yiisoft\\DataDb\\DataReader\\QueryDataReader', reason: 'hallucinated namespace quoted in a warning; the real namespace is Yiisoft\\Data\\Db (verified in composer.json)' },
  { match: 'Yiisoft\\Session\\Middleware', reason: 'wrong namespace quoted in warnings; the class resides directly in Yiisoft\\Session (verified in composer.json psr-4)' },
  // Short-name / external-parent resolution artifacts.
  { match: 'Yiisoft\\Yii\\Console\\Application::handle()', reason: 'short-name resolution artifact; the guide context is Yiisoft\\Yii\\Http\\Application, which has handle() (verified in yii-http/src/Application.php)' },
  { match: 'Yiisoft\\Yii\\Console\\Application::afterEmit()', reason: 'short-name resolution artifact; Yiisoft\\Yii\\Http\\Application has afterEmit() (verified in yii-http/src/Application.php)' },
  { match: 'Yiisoft\\Yii\\Console\\Application::setAutoExit()', reason: 'method inherited from symfony/console Application — external parent, not part of references/' },
  { match: 'Yiisoft\\Yii\\Console\\Application::run()', reason: 'method inherited from symfony/console Application — external parent, not part of references/' },
];

function readText(p) {
  return readFileSync(p, 'utf8').replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
}

// --- Build the PSR-4 class map from cloned packages -------------------------

function listPackages() {
  if (!existsSync(referencesDir)) return [];
  return readdirSync(referencesDir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();
}

function buildClassMap() {
  // prefixes: sorted longest-first, value = { pkg, base }
  const prefixes = [];
  let packages = 0;
  for (const pkg of listPackages()) {
    const composerPath = join(referencesDir, pkg, 'composer.json');
    const srcDir = join(referencesDir, pkg, 'src');
    if (!existsSync(composerPath) || !existsSync(srcDir)) continue;
    let composer;
    try {
      composer = JSON.parse(readText(composerPath));
    } catch {
      continue;
    }
    const psr4 = composer?.autoload?.['psr-4'];
    if (!psr4 || typeof psr4 !== 'object') continue;
    let used = false;
    for (const [prefix, base] of Object.entries(psr4)) {
      if (typeof base !== 'string') continue;
      prefixes.push({ prefix: prefix.replace(/\\+$/, ''), pkg, base: base.replace(/^\.?\/?/, '').replace(/\/+$/, '') });
      used = true;
    }
    if (used) packages++;
  }
  prefixes.sort((a, b) => b.prefix.length - a.prefix.length);
  return { prefixes, packages };
}

// Returns { kind: 'class'|'namespace'|'missing', path } for an FQCN.
function resolveFqcn(fqcn, classMap) {
  const entry = classMap.prefixes.find((p) => fqcn === p.prefix || fqcn.startsWith(p.prefix + '\\'));
  if (!entry) return { kind: 'missing', path: null };
  const rest = fqcn === entry.prefix ? '' : fqcn.slice(entry.prefix.length + 1);
  const base = join(referencesDir, entry.pkg, entry.base || 'src');
  if (rest === '') {
    // fqcn equals the PSR-4 prefix: either a real class named like the prefix
    // (e.g. Yiisoft\Html -> src/Html.php) or a package mention in prose.
    const last = entry.prefix.split('\\').pop();
    const file = join(base, last + '.php');
    if (existsSync(file)) return { kind: 'class', path: file };
    return { kind: 'namespace', path: null };
  }
  const file = join(base, ...rest.split('\\')) + '.php';
  if (existsSync(file)) return { kind: 'class', path: file };
  if (existsSync(join(base, ...rest.split('\\')))) return { kind: 'namespace', path: null };
  return { kind: 'missing', path: null };
}

// --- Inheritance resolution for method checks ------------------------------

function parseUseImports(src) {
  const imports = new Map();
  for (const m of src.matchAll(/^use\s+((?:\w+\\)*)?(\w+)(?:\s+as\s+(\w+))?\s*;/gm)) {
    const fq = (m[1] ?? '') + m[2];
    imports.set(m[3] ?? m[2], fq);
  }
  return imports;
}

function resolveName(name, namespace, imports) {
  if (name.startsWith('\\')) return name.slice(1);
  if (imports.has(name)) return imports.get(name);
  return namespace + '\\' + name;
}

function collectAncestors(src) {
  const ns = src.match(/^namespace\s+([\w\\]+)\s*;/m)?.[1] ?? '';
  const imports = parseUseImports(src);
  const out = [];
  // anchor on the real class declaration line, not on docblock code samples
  const decl = src.match(/(?:^|\n)\s*(?:abstract\s+|final\s+|readonly\s+)*class\s+\w+([^{]*)\{/);
  const declRest = decl?.[1] ?? '';
  const extendsMatch = declRest.match(/extends\s+([\w\\]+)/);
  if (extendsMatch) out.push(resolveName(extendsMatch[1], ns, imports));
  const implementsBlock = declRest.match(/implements\s+([\w\\\s,]+)/);
  if (implementsBlock) {
    for (const raw of implementsBlock[1].split(',')) {
      const name = raw.trim();
      if (name) out.push(resolveName(name, ns, imports));
    }
  }
  for (const m of src.matchAll(/^\s*use\s+([\w\\]+)\s*;/gm)) {
    if (/Function|const/.test(m[1])) continue;
    out.push(resolveName(m[1].trim(), ns, imports));
  }
  return out;
}

// --- Method signature extraction & deep verification -----------------------

function extractMethodSignature(src, methodName) {
  // Matches function declaration, capturing visibility, static, name, params, and return type
  const re = new RegExp(
    `(?:(public|protected|private)\\s+)?(?:(static)\\s+)?function\\s+(?:(static)\\s+)?&?\\s*${methodName.replace(/\\$/g, '\\$')}\\s*\\(([^)]*)\\)(?:\\s*:\\s*([\\w\\\\|&?]+))?`,
    'i'
  );
  const m = re.exec(src);
  if (!m) return null;

  const visibility = m[1] || 'public';
  const isStatic = Boolean(m[2] || m[3]);
  const rawParams = (m[4] || '').trim();
  const returnType = m[5] || null;

  const params = [];
  if (rawParams.length > 0) {
    let depth = 0;
    let current = '';
    for (const ch of rawParams) {
      if (ch === '[' || ch === '(') depth++;
      else if (ch === ']' || ch === ')') depth--;
      else if (ch === ',' && depth === 0) {
        if (current.trim()) params.push(current.trim());
        current = '';
        continue;
      }
      current += ch;
    }
    if (current.trim()) params.push(current.trim());
  }

  const parsedParams = params.map((p) => {
    const isVariadic = p.includes('...');
    const hasDefault = p.includes('=');
    const isRequired = !hasDefault && !isVariadic;
    const typeMatch = p.match(/^([\\w\\\\|&?]+)\s+(?:&)?(?:\.\.\.)?\$(\w+)/);
    const type = typeMatch ? typeMatch[1] : null;
    const nameMatch = p.match(/(?:\.\.\.)?\$(\w+)/);
    const name = nameMatch ? nameMatch[1] : '';
    return { name, type, isRequired, hasDefault, isVariadic };
  });

  const requiredCount = parsedParams.filter((p) => p.isRequired).length;
  const isVariadic = parsedParams.some((p) => p.isVariadic);
  const totalCount = isVariadic ? Infinity : parsedParams.length;

  return {
    visibility,
    isStatic,
    params: parsedParams,
    requiredCount,
    totalCount,
    isVariadic,
    returnType
  };
}

function findMethodInfo(fqcn, method, classMap, depth = 0, visited = new Set()) {
  if (visited.has(fqcn) || depth > 4) return null;
  visited.add(fqcn);
  const resolved = resolveFqcn(fqcn, classMap);
  if (resolved.kind !== 'class') return null;
  const src = readText(resolved.path);

  const sig = extractMethodSignature(src, method);
  if (sig) return { ...sig, definedIn: fqcn, isConstOrCase: false };

  // constants and enum cases are also valid on the right side of `::`
  if (new RegExp(`(const|case)\\s+${method}\\b`).test(src)) {
    return { isStatic: true, isConstOrCase: true, definedIn: fqcn, requiredCount: 0, totalCount: 0 };
  }

  for (const parent of collectAncestors(src)) {
    if (parent.startsWith('Yiisoft\\')) {
      const parentInfo = findMethodInfo(parent, method, classMap, depth + 1, visited);
      if (parentInfo) return parentInfo;
    }
  }
  return null;
}

function classHasMethod(fqcn, method, classMap, depth = 0, visited = new Set()) {
  return findMethodInfo(fqcn, method, classMap, depth, visited) !== null;
}

// --- Extraction -------------------------------------------------------------

function lineOf(text, index) {
  return text.slice(0, index).split('\n').length;
}

function extractSymbols(text) {
  const fqcnts = new Set();
  for (const m of text.matchAll(/\bYiisoft(\\[A-Za-z][A-Za-z0-9_]*)+/g)) {
    fqcnts.add(m[0].replace(/\\+$/, ''));
  }
  const pairs = [];
  const seen = new Set();
  for (const m of text.matchAll(/\b(Yiisoft(?:\\[A-Za-z][A-Za-z0-9_]*)+|[A-Z][A-Za-z0-9_]*)::([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/g)) {
    const key = `${m[1]}::${m[2]}`;
    if (seen.has(key)) continue;
    seen.add(key);
    pairs.push({ cls: m[1], method: m[2], fq: m[1].startsWith('Yiisoft\\'), index: m.index });
  }
  return { fqcnts, pairs };
}

function matchCallParen(text, openIdx) {
  let depth = 0;
  let inSingleQuote = false;
  let inDoubleQuote = false;
  for (let i = openIdx; i < text.length; i++) {
    const ch = text[i];
    const prev = i > 0 ? text[i - 1] : '';
    if (inSingleQuote) {
      if (ch === '\'' && prev !== '\\') inSingleQuote = false;
      continue;
    }
    if (inDoubleQuote) {
      if (ch === '"' && prev !== '\\') inDoubleQuote = false;
      continue;
    }
    if (ch === '\'') { inSingleQuote = true; continue; }
    if (ch === '"') { inDoubleQuote = true; continue; }
    if (ch === '(') depth++;
    else if (ch === ')' && --depth === 0) return i;
  }
  return -1;
}

function countCallArguments(callArgsText) {
  let depth = 0;
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let argCount = 0;
  let hasChars = false;

  for (let i = 0; i < callArgsText.length; i++) {
    const ch = callArgsText[i];
    const prev = i > 0 ? callArgsText[i - 1] : '';

    if (inSingleQuote) {
      if (ch === '\'' && prev !== '\\') inSingleQuote = false;
      hasChars = true;
      continue;
    }
    if (inDoubleQuote) {
      if (ch === '"' && prev !== '\\') inDoubleQuote = false;
      hasChars = true;
      continue;
    }
    if (ch === '\'') {
      inSingleQuote = true;
      hasChars = true;
      continue;
    }
    if (ch === '"') {
      inDoubleQuote = true;
      hasChars = true;
      continue;
    }

    if (ch === '(' || ch === '[' || ch === '{') {
      depth++;
      hasChars = true;
      continue;
    }
    if (ch === ')' || ch === ']' || ch === '}') {
      depth--;
      hasChars = true;
      continue;
    }

    if (ch === ',' && depth === 0) {
      if (hasChars) argCount++;
      hasChars = false;
      continue;
    }

    if (!/\s/.test(ch)) {
      hasChars = true;
    }
  }

  if (hasChars) argCount++;
  return argCount;
}

// --- Main -------------------------------------------------------------------

const classMap = buildClassMap();
const guideFiles = readdirSync(guidesDir).filter((f) => f.endsWith('.md')).sort();
const unconfirmed = [];
let checkedClasses = 0;
let checkedPairs = 0;
let skippedShortPairs = 0;
let allowlisted = 0;

let checkedSignatures = 0;
const confirmedManifest = { fqcns: [], methods: {} };

if (forceManifestMode || classMap.packages === 0) {
  if (existsSync(manifestPath)) {
    console.log('NOTE [check-symbols] running in manifest verification mode (CI environment without references/ clones).');
    const manifest = JSON.parse(readText(manifestPath));
    const knownFqcns = new Set(manifest.fqcns || []);
    const knownMethods = manifest.methods || {};

    for (const file of guideFiles) {
      const text = readText(join(guidesDir, file));
      const { fqcnts, pairs } = extractSymbols(text);
      const imports = new Map();
      const ambiguous = new Set();
      for (const fq of fqcnts) {
        const short = fq.split('\\').pop();
        if (imports.has(short) && imports.get(short) !== fq) ambiguous.add(short);
        else imports.set(short, fq);
      }

      for (const fq of fqcnts) {
        const tag = `${fq}@${file}`;
        if (ALLOWLIST.some((a) => tag.includes(a.match))) { allowlisted++; continue; }
        if (!knownFqcns.has(fq) && !fq.endsWith('\\*')) {
          const line = lineOf(text, text.indexOf(fq));
          unconfirmed.push(`${file}:${line} — class not found in manifest — ${fq}`);
        } else {
          checkedClasses++;
        }
      }

      for (const pair of pairs) {
        let fqcn = null;
        if (pair.fq) fqcn = pair.cls;
        else if (imports.has(pair.cls) && !ambiguous.has(pair.cls)) fqcn = imports.get(pair.cls);
        else { skippedShortPairs++; continue; }

        const tag = `${fqcn}::${pair.method}()@${file}`;
        if (ALLOWLIST.some((a) => tag.includes(a.match))) { allowlisted++; continue; }
        checkedPairs++;
        const methodKey = `${fqcn}::${pair.method}`;
        if (!knownMethods[methodKey]) {
          const line = lineOf(text, pair.index);
          unconfirmed.push(`${file}:${line} — method not found in manifest — ${fqcn}::${pair.method}()`);
        } else {
          checkedSignatures++;
        }
      }
    }

    for (const line of unconfirmed) console.log(line);
    console.log(`check-symbols (manifest mode): ${checkedClasses} FQCNs confirmed, ${checkedPairs} methods confirmed (${checkedSignatures} signatures verified), ${skippedShortPairs} short pairs skipped, ${allowlisted} allowlisted, ${unconfirmed.length} unconfirmed.`);
    process.exit(unconfirmed.length > 0 ? 1 : 0);
  }

  console.log('WARN [check-symbols] no package clones found under references/ and no manifest found — nothing to verify against.');
  console.log('check-symbols: skipped (populate references/ per references/README.md or generate manifest)');
  process.exit(0);
}

for (const file of guideFiles) {
  const text = readText(join(guidesDir, file));
  const { fqcnts, pairs } = extractSymbols(text);

  // import map for short-name resolution: FQCNs mentioned in the same guide
  const imports = new Map();
  const ambiguous = new Set();
  for (const fq of fqcnts) {
    const short = fq.split('\\').pop();
    if (imports.has(short) && imports.get(short) !== fq) {
      ambiguous.add(short);
    } else {
      imports.set(short, fq);
    }
  }

  for (const fq of fqcnts) {
    const tag = `${fq}@${file}`;
    if (ALLOWLIST.some((a) => tag.includes(a.match))) { allowlisted++; continue; }
    const resolved = resolveFqcn(fq, classMap);
    if (resolved.kind === 'missing') {
      const line = lineOf(text, text.indexOf(fq));
      unconfirmed.push(`${file}:${line} — class not found in references/*/src — ${fq}`);
    } else {
      checkedClasses++;
      if (!confirmedManifest.fqcns.includes(fq)) confirmedManifest.fqcns.push(fq);
    }
    // kind === 'namespace' → namespace mention (e.g. `Yiisoft\Validator\Rule\*`), not a class
  }

  for (const pair of pairs) {
    let fqcn = null;
    if (pair.fq) {
      fqcn = pair.cls;
    } else if (imports.has(pair.cls) && !ambiguous.has(pair.cls)) {
      fqcn = imports.get(pair.cls);
    } else {
      skippedShortPairs++;
      continue;
    }
    const tag = `${fqcn}::${pair.method}()@${file}`;
    if (ALLOWLIST.some((a) => tag.includes(a.match))) { allowlisted++; continue; }
    checkedPairs++;
    const methodInfo = findMethodInfo(fqcn, pair.method, classMap);
    if (!methodInfo) {
      const line = lineOf(text, pair.index);
      unconfirmed.push(`${file}:${line} — method not found (class or its Yiisoft ancestors) — ${fqcn}::${pair.method}()`);
    } else {
      checkedSignatures++;
      confirmedManifest.methods[`${fqcn}::${pair.method}`] = {
        isStatic: methodInfo.isStatic,
        requiredCount: methodInfo.requiredCount,
        totalCount: methodInfo.totalCount,
        returnType: methodInfo.returnType,
      };

      // Deep verification: arity check if arguments are explicitly passed in call (and not a const/case)
      if (!methodInfo.isConstOrCase) {
        const openParen = text.indexOf('(', pair.index);
        if (openParen !== -1) {
          const closeParen = matchCallParen(text, openParen);
          if (closeParen !== -1 && closeParen > openParen) {
            const callArgs = text.slice(openParen + 1, closeParen).trim();
            if (callArgs.length > 0 && !callArgs.includes('...')) {
              const argCount = countCallArguments(callArgs);
              if (argCount > methodInfo.totalCount && !methodInfo.isVariadic) {
                const line = lineOf(text, pair.index);
                unconfirmed.push(`${file}:${line} — arity mismatch: ${fqcn}::${pair.method}() accepts at most ${methodInfo.totalCount} arguments, but call provides ${argCount}`);
              }
            }
          }
        }
      }
    }
  }
}

if (shouldExportManifest && unconfirmed.length === 0) {
  mkdirSync(dirname(manifestPath), { recursive: true });
  const payload = {
    metadata: {
      generated_at: new Date().toISOString(),
      source: 'references/ (130 yiisoft/* package clones)',
      packages_indexed: classMap.packages,
    },
    fqcns: [...new Set(confirmedManifest.fqcns)].sort(),
    methods: confirmedManifest.methods,
  };
  writeFileSync(manifestPath, JSON.stringify(payload, null, 2));
  console.log(`[check-symbols] exported API symbols manifest with ${payload.fqcns.length} classes and ${Object.keys(payload.methods).length} signatures to ${manifestPath}`);
}

for (const line of unconfirmed) console.log(line);
console.log(`check-symbols: ${classMap.packages} packages indexed, ${checkedClasses} FQCNs confirmed, ${checkedPairs} method pairs confirmed (${checkedSignatures} signatures verified), ${skippedShortPairs} short pairs skipped (no unambiguous FQCN), ${allowlisted} allowlisted, ${unconfirmed.length} unconfirmed.`);
process.exit(unconfirmed.length > 0 ? 1 : 0);
