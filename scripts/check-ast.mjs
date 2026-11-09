#!/usr/bin/env node
// AST-based PHP Code & Signature Grounding Analyzer (Node >= 18, ESM, node:* stdlib only).
//
// Extracts all ```php code blocks from skills/yii3/references/*.md, determines
// variable types and static references, and validates:
//   1. Instance method calls ($var->method(), $this->prop->method(), fluent chains)
//   2. Static method calls (Class::method(), and fluent chains on return types)
//   3. Method existence across class hierarchies (parents, interfaces, traits)
//   4. Method visibility (must be public for external / chained calls)
//   5. Calling conventions (static vs instance method invocations)
//   6. Call arity (minimum required parameters, maximum allowed parameters, variadics)
//   7. Named arguments (argument name must match a declared parameter name)
//
// Zero npm or composer dependencies; parses and statically evaluates purely in Node.js.
// Exit codes:
//   0 — all calls and signatures confirmed, or verified against AST manifest on CI
//   1 — at least one call defect found (method missing, arity/visibility/named arg violation)

import { existsSync, readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const guidesDir = join(root, 'skills', 'yii3', 'references');
const referencesDir = join(root, 'references');
const manifestPath = join(root, 'evals', 'data', 'ast-signatures-manifest.json');
const shouldExportManifest = process.argv.includes('--export-manifest') || process.env.UPDATE_MANIFEST === '1';
const forceManifestMode = process.argv.includes('--manifest-mode');

const confirmedManifest = {
  classes: new Set(),
  methods: {}
};

function recordManifestMethod(fqcn, methodName, info) {
  if (!info) return;
  const key = `${fqcn}::${methodName}`;
  confirmedManifest.methods[key] = {
    visibility: info.visibility || 'public',
    isStatic: Boolean(info.isStatic),
    requiredCount: info.requiredCount ?? 0,
    totalCount: info.isVariadic ? 999 : (info.totalCount ?? 0),
    isVariadic: Boolean(info.isVariadic),
    returnType: info.returnType || null,
    definedIn: info.definedIn || fqcn,
    isConstOrCase: Boolean(info.isConstOrCase),
    params: (info.params || []).map((p) => ({
      name: p.name,
      hasDefault: Boolean(p.hasDefault),
      isVariadic: Boolean(p.isVariadic)
    }))
  };
  confirmedManifest.classes.add(fqcn);
  if (info.definedIn) confirmedManifest.classes.add(info.definedIn);
  if (info.returnType && info.returnType.startsWith('Yiisoft\\')) {
    confirmedManifest.classes.add(info.returnType);
  }
}

// Allowlist of intentional negative or anti-pattern examples documented in guides.
// Each entry: { match: RegExp | string, reason: string }.
const ALLOWLIST = [
  { match: 'Yiisoft\\Cookies\\Cookie::create()', reason: 'phantom method quoted in anti-pattern row; constructor is the documented path' },
  { match: 'Yiisoft\\FormModel\\Field::widget()', reason: 'anti-pattern row about wrong instance invocation on static factory' },
  { match: 'Yiisoft\\FormModel\\Field::submit()', reason: 'anti-pattern row quoting non-existent Field factory method' },
  { match: 'Yiisoft\\FormModel\\Field::radio()', reason: 'anti-pattern row quoting non-existent Field factory method' },
  { match: 'Yiisoft\\FormModel\\Field::reset()', reason: 'anti-pattern row quoting non-existent Field factory method' },
  { match: 'Yiisoft\\FormModel\\Field::tel()', reason: 'anti-pattern row quoting non-existent Field factory method' },
];

function isAllowlisted(defectStr) {
  return ALLOWLIST.some((entry) => {
    if (typeof entry.match === 'string') return defectStr.includes(entry.match);
    return entry.match.test(defectStr);
  });
}

function readText(p) {
  return readFileSync(p, 'utf8').replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
}

function isEscaped(str, idx) {
  let count = 0;
  for (let i = idx - 1; i >= 0 && str[i] === '\\'; i--) {
    count++;
  }
  return count % 2 === 1;
}

// Strips comments from PHP code blocks, safely handling single/double-quoted strings.
function stripPhpComments(code) {
  let result = '';
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let inLineComment = false;
  let inBlockComment = false;

  for (let i = 0; i < code.length; i++) {
    const ch = code[i];
    const next = i + 1 < code.length ? code[i + 1] : '';

    if (inLineComment) {
      if (ch === '\n') {
        inLineComment = false;
        result += ch;
      }
      continue;
    }

    if (inBlockComment) {
      if (ch === '*' && next === '/') {
        inBlockComment = false;
        i++;
      }
      continue;
    }

    if (inSingleQuote) {
      result += ch;
      if (ch === "'" && !isEscaped(code, i)) inSingleQuote = false;
      continue;
    }

    if (inDoubleQuote) {
      result += ch;
      if (ch === '"' && !isEscaped(code, i)) inDoubleQuote = false;
      continue;
    }

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

    if (ch === "'") {
      inSingleQuote = true;
      result += ch;
      continue;
    }
    if (ch === '"') {
      inDoubleQuote = true;
      result += ch;
      continue;
    }

    result += ch;
  }
  return result;
}

// Builds the PSR-4 class prefix map from references/<pkg>/composer.json
function listPackages() {
  if (!existsSync(referencesDir)) return [];
  return readdirSync(referencesDir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();
}

function buildClassMap() {
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

function resolveFqcn(fqcn, classMap) {
  const entry = classMap.prefixes.find((p) => fqcn === p.prefix || fqcn.startsWith(p.prefix + '\\'));
  if (!entry) return { kind: 'missing', path: null };
  const rest = fqcn === entry.prefix ? '' : fqcn.slice(entry.prefix.length + 1);
  const base = join(referencesDir, entry.pkg, entry.base || 'src');
  if (rest === '') {
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
  return namespace ? `${namespace}\\${name}` : name;
}

function collectAncestors(src) {
  const ns = src.match(/^namespace\s+([\w\\]+)\s*;/m)?.[1] ?? '';
  const imports = parseUseImports(src);
  const out = [];
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

// External contracts that Yiisoft classes implement or interact with
const EXTERNAL_INTERFACES = {
  'Psr\\Log\\LoggerInterface': {
    methods: {
      emergency: { visibility: 'public', isStatic: false, requiredCount: 1, totalCount: 2 },
      alert: { visibility: 'public', isStatic: false, requiredCount: 1, totalCount: 2 },
      critical: { visibility: 'public', isStatic: false, requiredCount: 1, totalCount: 2 },
      error: { visibility: 'public', isStatic: false, requiredCount: 1, totalCount: 2 },
      warning: { visibility: 'public', isStatic: false, requiredCount: 1, totalCount: 2 },
      notice: { visibility: 'public', isStatic: false, requiredCount: 1, totalCount: 2 },
      info: { visibility: 'public', isStatic: false, requiredCount: 1, totalCount: 2 },
      debug: { visibility: 'public', isStatic: false, requiredCount: 1, totalCount: 2 },
      log: { visibility: 'public', isStatic: false, requiredCount: 2, totalCount: 3 },
    }
  },
  'Psr\\Http\\Message\\ResponseInterface': {
    methods: {
      getStatusCode: { visibility: 'public', isStatic: false, requiredCount: 0, totalCount: 0 },
      withStatus: { visibility: 'public', isStatic: false, requiredCount: 1, totalCount: 2 },
      getReasonPhrase: { visibility: 'public', isStatic: false, requiredCount: 0, totalCount: 0 },
      getHeader: { visibility: 'public', isStatic: false, requiredCount: 1, totalCount: 1 },
      getHeaderLine: { visibility: 'public', isStatic: false, requiredCount: 1, totalCount: 1 },
      getHeaders: { visibility: 'public', isStatic: false, requiredCount: 0, totalCount: 0 },
      hasHeader: { visibility: 'public', isStatic: false, requiredCount: 1, totalCount: 1 },
      withHeader: { visibility: 'public', isStatic: false, requiredCount: 2, totalCount: 2 },
      withAddedHeader: { visibility: 'public', isStatic: false, requiredCount: 2, totalCount: 2 },
      withoutHeader: { visibility: 'public', isStatic: false, requiredCount: 1, totalCount: 1 },
      getBody: { visibility: 'public', isStatic: false, requiredCount: 0, totalCount: 0 },
      withBody: { visibility: 'public', isStatic: false, requiredCount: 1, totalCount: 1 },
    }
  },
  'Psr\\Http\\Message\\ResponseFactoryInterface': {
    methods: {
      createResponse: { visibility: 'public', isStatic: false, requiredCount: 0, totalCount: 2, returnType: 'Psr\\Http\\Message\\ResponseInterface' },
    }
  },
  'Psr\\Http\\Message\\ServerRequestInterface': {
    methods: {
      getMethod: { visibility: 'public', isStatic: false, requiredCount: 0, totalCount: 0 },
      getUri: { visibility: 'public', isStatic: false, requiredCount: 0, totalCount: 0 },
      getQueryParams: { visibility: 'public', isStatic: false, requiredCount: 0, totalCount: 0 },
      getParsedBody: { visibility: 'public', isStatic: false, requiredCount: 0, totalCount: 0 },
      getAttributes: { visibility: 'public', isStatic: false, requiredCount: 0, totalCount: 0 },
      getAttribute: { visibility: 'public', isStatic: false, requiredCount: 1, totalCount: 2 },
      withAttribute: { visibility: 'public', isStatic: false, requiredCount: 2, totalCount: 2 },
      withoutAttribute: { visibility: 'public', isStatic: false, requiredCount: 1, totalCount: 1 },
      getCookieParams: { visibility: 'public', isStatic: false, requiredCount: 0, totalCount: 0 },
      getUploadedFiles: { visibility: 'public', isStatic: false, requiredCount: 0, totalCount: 0 },
      getServerParams: { visibility: 'public', isStatic: false, requiredCount: 0, totalCount: 0 },
    }
  },
  'Psr\\Container\\ContainerInterface': {
    methods: {
      get: { visibility: 'public', isStatic: false, requiredCount: 1, totalCount: 1 },
      has: { visibility: 'public', isStatic: false, requiredCount: 1, totalCount: 1 },
    }
  },
  'Symfony\\Component\\Console\\Application': {
    methods: {
      find: { visibility: 'public', isStatic: false, requiredCount: 1, totalCount: 1 },
      setCommandLoader: { visibility: 'public', isStatic: false, requiredCount: 1, totalCount: 1 },
      run: { visibility: 'public', isStatic: false, requiredCount: 0, totalCount: 2 },
      setAutoExit: { visibility: 'public', isStatic: false, requiredCount: 1, totalCount: 1 },
    }
  }
};

function extractMethodSignature(src, methodName, fqcn, callingClass = fqcn) {
  const re = new RegExp(
    `(?:(public|protected|private)\\s+)?(?:(static)\\s+)?function\\s+(?:(static)\\s+)?&?\\s*${methodName.replace(/\\$/g, '\\$')}\\s*\\(([^)]*)\\)(?:\\s*:\\s*([\\w\\\\|&?]+))?`,
    'i'
  );
  const m = re.exec(src);
  if (!m) return null;

  const visibility = m[1] || 'public';
  const isStatic = Boolean(m[2] || m[3]);
  const rawParams = (m[4] || '').trim();
  const rawReturnType = m[5] || null;

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

  let resolvedReturnType = null;
  if (rawReturnType) {
    const clean = rawReturnType.replace(/^\?/, '').trim();
    if (clean === 'static') {
      resolvedReturnType = callingClass || fqcn;
    } else if (['self', '$this', 'this'].includes(clean)) {
      resolvedReturnType = fqcn;
    } else if (['void', 'int', 'string', 'bool', 'float', 'array', 'iterable', 'callable', 'mixed', 'never', 'object', 'false', 'true', 'null'].includes(clean)) {
      resolvedReturnType = null;
    } else {
      const classImports = parseUseImports(src);
      const classNs = src.match(/^namespace\s+([\w\\]+)\s*;/m)?.[1] ?? '';
      if (clean.startsWith('\\')) {
        resolvedReturnType = clean.slice(1);
      } else if (classImports.has(clean)) {
        resolvedReturnType = classImports.get(clean);
      } else if (classNs) {
        resolvedReturnType = `${classNs}\\${clean}`;
      } else {
        resolvedReturnType = clean;
      }
    }
  }

  return {
    visibility,
    isStatic,
    params: parsedParams,
    requiredCount,
    totalCount,
    isVariadic,
    returnType: resolvedReturnType
  };
}

function findMethodInfo(fqcn, method, classMap, callingClass = fqcn, depth = 0, visited = new Set(), manifest = null) {
  const visitKey = `${fqcn}::${method}`;
  if (visited.has(visitKey) || depth > 4) return null;
  visited.add(visitKey);

  if (EXTERNAL_INTERFACES[fqcn]?.methods[method]) {
    const res = { ...EXTERNAL_INTERFACES[fqcn].methods[method], definedIn: fqcn, isConstOrCase: false };
    recordManifestMethod(fqcn, method, res);
    return res;
  }

  if (manifest) {
    const key = `${fqcn}::${method}`;
    if (manifest.methods?.[key]) {
      return manifest.methods[key];
    }
    return null;
  }

  const resolved = resolveFqcn(fqcn, classMap);
  if (resolved.kind !== 'class') return null;
  const src = readText(resolved.path);

  const sig = extractMethodSignature(src, method, fqcn, callingClass);
  if (sig) {
    const res = { ...sig, definedIn: fqcn, isConstOrCase: false };
    recordManifestMethod(fqcn, method, res);
    return res;
  }

  if (new RegExp(`(const|case)\\s+${method}\\b`).test(src)) {
    const res = { isStatic: true, isConstOrCase: true, definedIn: fqcn, requiredCount: 0, totalCount: 0 };
    recordManifestMethod(fqcn, method, res);
    return res;
  }

  for (const parent of collectAncestors(src)) {
    const parentInfo = findMethodInfo(parent, method, classMap, callingClass, depth + 1, visited, manifest);
    if (parentInfo) {
      recordManifestMethod(fqcn, method, parentInfo);
      return parentInfo;
    }
  }
  return null;
}

function countCallArguments(callArgsText) {
  let depth = 0;
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let argCount = 0;
  let hasChars = false;
  const namedArgs = [];

  let current = '';

  for (let i = 0; i < callArgsText.length; i++) {
    const ch = callArgsText[i];

    if (inSingleQuote) {
      if (ch === "'" && !isEscaped(callArgsText, i)) inSingleQuote = false;
      hasChars = true;
      current += ch;
      continue;
    }
    if (inDoubleQuote) {
      if (ch === '"' && !isEscaped(callArgsText, i)) inDoubleQuote = false;
      hasChars = true;
      current += ch;
      continue;
    }
    if (ch === "'") { inSingleQuote = true; hasChars = true; current += ch; continue; }
    if (ch === '"') { inDoubleQuote = true; hasChars = true; current += ch; continue; }

    if (ch === '(' || ch === '[' || ch === '{') {
      depth++;
      hasChars = true;
      current += ch;
      continue;
    }
    if (ch === ')' || ch === ']' || ch === '}') {
      depth--;
      hasChars = true;
      current += ch;
      continue;
    }

    if (ch === ',' && depth === 0) {
      if (hasChars) {
        argCount++;
        // Named arg: identifier: (not followed by another :)
        const namedMatch = current.trim().match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*:(?!:)/);
        if (namedMatch) namedArgs.push(namedMatch[1]);
      }
      hasChars = false;
      current = '';
      continue;
    }

    if (!/\s/.test(ch)) {
      hasChars = true;
    }
    current += ch;
  }

  if (hasChars) {
    argCount++;
    const namedMatch = current.trim().match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*:(?!:)/);
    if (namedMatch) namedArgs.push(namedMatch[1]);
  }

  return { argCount, namedArgs };
}

function matchCallParen(text, openIdx) {
  let depth = 0;
  let inSingleQuote = false;
  let inDoubleQuote = false;
  for (let i = openIdx; i < text.length; i++) {
    const ch = text[i];
    if (inSingleQuote) {
      if (ch === "'" && !isEscaped(text, i)) inSingleQuote = false;
      continue;
    }
    if (inDoubleQuote) {
      if (ch === '"' && !isEscaped(text, i)) inDoubleQuote = false;
      continue;
    }
    if (ch === "'") { inSingleQuote = true; continue; }
    if (ch === '"') { inDoubleQuote = true; continue; }
    if (ch === '(') depth++;
    else if (ch === ')' && --depth === 0) return i;
  }
  return -1;
}

function extractChainedCalls(code, startIdx, initialType, initialVarName, imports, classMap, manifest = null) {
  const calls = [];
  let currentIdx = startIdx;
  let currentType = initialType;

  while (currentIdx < code.length) {
    const remaining = code.slice(currentIdx);
    const arrowMatch = remaining.match(/^\s*->\s*([a-zA-Z0-9_]+)\s*\(/);
    if (!arrowMatch) break;

    const methodName = arrowMatch[1];
    const openParenIdx = currentIdx + arrowMatch[0].indexOf('(');
    const closeParenIdx = matchCallParen(code, openParenIdx);
    if (closeParenIdx === -1) break;

    const argsText = code.slice(openParenIdx + 1, closeParenIdx);
    calls.push({
      methodName,
      argsText,
      targetType: currentType,
      varName: initialVarName,
      openParenIdx,
      closeParenIdx
    });

    if (currentType) {
      const info = findMethodInfo(currentType, methodName, classMap, currentType, 0, new Set(), manifest);
      if (info?.returnType) {
        currentType = info.returnType;
      } else {
        currentType = null;
      }
    }

    currentIdx = closeParenIdx + 1;
  }

  return { calls, endIdx: currentIdx };
}

// Main execution
function main() {
  const classMap = buildClassMap();
  let manifest = null;

  if (forceManifestMode || classMap.prefixes.length === 0) {
    if (existsSync(manifestPath)) {
      console.log('NOTE [check-ast] running in manifest verification mode (CI environment without references/ clones).');
      manifest = JSON.parse(readText(manifestPath));
    } else {
      console.log('[check-ast] references/ directory not present and no manifest found. Skipping full AST validation.');
      process.exit(0);
    }
  }

  const guideFiles = existsSync(guidesDir)
    ? readdirSync(guidesDir).filter((f) => f.endsWith('.md')).sort()
    : [];

  let totalPhpBlocks = 0;
  let totalInstanceCalls = 0;
  let verifiedInstanceCalls = 0;
  let totalStaticCalls = 0;
  let verifiedStaticCalls = 0;
  let verifiedArities = 0;
  let verifiedNamedArgs = 0;
  const defects = [];

  for (const file of guideFiles) {
    const text = readText(join(guidesDir, file));
    const blocks = [...text.matchAll(/```php([\s\S]*?)```/g)].map((m) => m[1]);
    totalPhpBlocks += blocks.length;

    for (let code of blocks) {
      code = stripPhpComments(code);
      const imports = parseUseImports(code);
      const varTypes = new Map();

      // 1. Promoted constructor properties
      for (const m of code.matchAll(/(?:private|protected|public)\s+(?:readonly\s+)?([\\a-zA-Z0-9_]+)\s+\$([a-zA-Z0-9_]+)/g)) {
        varTypes.set(`this->${m[2]}`, m[1]);
        varTypes.set(m[2], m[1]);
      }
      // 2. Class properties
      for (const m of code.matchAll(/(?:private|protected|public)\s+(?:readonly\s+)?([\\a-zA-Z0-9_]+)\s+\$([a-zA-Z0-9_]+)\s*;/g)) {
        varTypes.set(`this->${m[2]}`, m[1]);
        varTypes.set(m[2], m[1]);
      }
      // 3. Method parameters
      for (const m of code.matchAll(/function\s+[a-zA-Z0-9_]+\s*\(([\s\S]*?)\)/g)) {
        const params = m[1].split(',');
        for (const p of params) {
          const pm = p.trim().match(/([\\a-zA-Z0-9_]+)\s+\$([a-zA-Z0-9_]+)/);
          if (pm && !['private', 'protected', 'public', 'readonly'].includes(pm[1])) {
            varTypes.set(pm[2], pm[1]);
          }
        }
      }
      // 4. Instantiations: $var = new Type(...)
      for (const m of code.matchAll(/\$([a-zA-Z0-9_]+)\s*=\s*new\s+([\\a-zA-Z0-9_]+)/g)) {
        varTypes.set(m[1], m[2]);
      }
      // 5. Container get: $var = $container->get(Type::class)
      for (const m of code.matchAll(/\$([a-zA-Z0-9_]+)\s*=\s*\$[a-zA-Z0-9_]+->get\(\s*([\\a-zA-Z0-9_]+)::class\s*\)/g)) {
        varTypes.set(m[1], m[2]);
      }

      // Extract instance calls & fluent chains: $var->method() or $this->prop->method()
      for (const m of code.matchAll(/(?:\$this->([a-zA-Z0-9_]+)|\$([a-zA-Z0-9_]+))(?=\s*->)/g)) {
        const varKey = m[1] ? `this->${m[1]}` : m[2];
        const rawType = varTypes.get(varKey);
        if (!rawType) continue;

        let fqcn = rawType.startsWith('\\') ? rawType.slice(1) : (imports.get(rawType) || rawType);

        const { calls } = extractChainedCalls(code, m.index + m[0].length, fqcn, varKey, imports, classMap, manifest);

        for (const call of calls) {
          if (!call.targetType || !call.targetType.startsWith('Yiisoft\\')) continue;

          totalInstanceCalls++;
          const methodName = call.methodName;
          const methodInfo = findMethodInfo(call.targetType, methodName, classMap, call.targetType, 0, new Set(), manifest);

          if (!methodInfo) {
            const err = `${file}: instance call $${call.varName} (${call.targetType})->${methodName}() not found`;
            if (!isAllowlisted(err)) defects.push(err);
            continue;
          }

          verifiedInstanceCalls++;

          // Visibility check
          if (methodInfo.visibility && methodInfo.visibility !== 'public') {
            const err = `${file}: non-public method called: $${call.varName} (${call.targetType})->${methodName}() is ${methodInfo.visibility}`;
            if (!isAllowlisted(err)) defects.push(err);
          }

          // Arity and named arguments check
          const { argCount, namedArgs } = countCallArguments(call.argsText);

          if (methodInfo.requiredCount !== undefined) {
            if (argCount < methodInfo.requiredCount) {
              const err = `${file}: arity underflow on $${call.varName} (${call.targetType})->${methodName}(): expected >= ${methodInfo.requiredCount}, got ${argCount}`;
              if (!isAllowlisted(err)) defects.push(err);
            } else if (!methodInfo.isVariadic && methodInfo.totalCount !== null && argCount > methodInfo.totalCount) {
              const err = `${file}: arity overflow on $${call.varName} (${call.targetType})->${methodName}(): expected <= ${methodInfo.totalCount}, got ${argCount}`;
              if (!isAllowlisted(err)) defects.push(err);
            } else {
              verifiedArities++;
            }
          }

          // Named arguments check
          if (namedArgs.length > 0 && methodInfo.params) {
            const declaredParamNames = new Set(methodInfo.params.map((p) => p.name));
            for (const na of namedArgs) {
              if (!declaredParamNames.has(na)) {
                const err = `${file}: invalid named argument "${na}" on $${call.varName} (${call.targetType})->${methodName}()`;
                if (!isAllowlisted(err)) defects.push(err);
              } else {
                verifiedNamedArgs++;
              }
            }
          }
        }
      }

      // Extract static calls: Class::method(args)
      for (const m of code.matchAll(/([\\a-zA-Z0-9_]+)::([a-zA-Z0-9_]+)\s*\(/g)) {
        const className = m[1];
        const methodName = m[2];
        if (['self', 'static', 'parent'].includes(className)) continue;

        let fqcn = className.startsWith('\\') ? className.slice(1) : (imports.get(className) || className);
        if (!fqcn.startsWith('Yiisoft\\')) continue;

        totalStaticCalls++;
        const methodInfo = findMethodInfo(fqcn, methodName, classMap, fqcn, 0, new Set(), manifest);
        if (!methodInfo) {
          const err = `${file}: static call ${fqcn}::${methodName}() not found`;
          if (!isAllowlisted(err)) defects.push(err);
          continue;
        }

        verifiedStaticCalls++;

        // Calling convention check
        if (methodInfo.isStatic === false && !methodInfo.isConstOrCase) {
          const err = `${file}: non-static method called statically: ${fqcn}::${methodName}()`;
          if (!isAllowlisted(err)) defects.push(err);
        }

        // Visibility check
        if (methodInfo.visibility && methodInfo.visibility !== 'public') {
          const err = `${file}: non-public static method called: ${fqcn}::${methodName}() is ${methodInfo.visibility}`;
          if (!isAllowlisted(err)) defects.push(err);
        }

        // Arity and named arguments check
        const callOpenIdx = m.index + m[0].length - 1;
        const callCloseIdx = matchCallParen(code, callOpenIdx);
        if (callCloseIdx !== -1) {
          const callArgsText = code.slice(callOpenIdx + 1, callCloseIdx);
          const { argCount, namedArgs } = countCallArguments(callArgsText);

          if (methodInfo.requiredCount !== undefined) {
            if (argCount < methodInfo.requiredCount) {
              const err = `${file}: arity underflow on ${fqcn}::${methodName}(): expected >= ${methodInfo.requiredCount}, got ${argCount}`;
              if (!isAllowlisted(err)) defects.push(err);
            } else if (!methodInfo.isVariadic && methodInfo.totalCount !== null && argCount > methodInfo.totalCount) {
              const err = `${file}: arity overflow on ${fqcn}::${methodName}(): expected <= ${methodInfo.totalCount}, got ${argCount}`;
              if (!isAllowlisted(err)) defects.push(err);
            } else {
              verifiedArities++;
            }
          }

          if (namedArgs.length > 0 && methodInfo.params) {
            const declaredParamNames = new Set(methodInfo.params.map((p) => p.name));
            for (const na of namedArgs) {
              if (!declaredParamNames.has(na)) {
                const err = `${file}: invalid named argument "${na}" on ${fqcn}::${methodName}()`;
                if (!isAllowlisted(err)) defects.push(err);
              } else {
                verifiedNamedArgs++;
              }
            }
          }

          // Chained calls on static return type (e.g. Route::get()->action(), GridView::widget()->dataReader())
          if (methodInfo.returnType) {
            const { calls } = extractChainedCalls(code, callCloseIdx + 1, methodInfo.returnType, `${className}::${methodName}()`, imports, classMap, manifest);
            for (const call of calls) {
              if (!call.targetType || !call.targetType.startsWith('Yiisoft\\')) continue;
              totalInstanceCalls++;
              const chainedInfo = findMethodInfo(call.targetType, call.methodName, classMap, call.targetType, 0, new Set(), manifest);
              if (!chainedInfo) {
                const err = `${file}: chained instance call on ${call.varName} (${call.targetType})->${call.methodName}() not found`;
                if (!isAllowlisted(err)) defects.push(err);
                continue;
              }
              verifiedInstanceCalls++;
              if (chainedInfo.visibility && chainedInfo.visibility !== 'public') {
                const err = `${file}: non-public chained method: ${call.targetType}->${call.methodName}() is ${chainedInfo.visibility}`;
                if (!isAllowlisted(err)) defects.push(err);
              }
              const { argCount: cArgs, namedArgs: cNamed } = countCallArguments(call.argsText);
              if (chainedInfo.requiredCount !== undefined) {
                if (cArgs < chainedInfo.requiredCount) {
                  const err = `${file}: arity underflow on ${call.targetType}->${call.methodName}(): expected >= ${chainedInfo.requiredCount}, got ${cArgs}`;
                  if (!isAllowlisted(err)) defects.push(err);
                } else if (!chainedInfo.isVariadic && chainedInfo.totalCount !== null && cArgs > chainedInfo.totalCount) {
                  const err = `${file}: arity overflow on ${call.targetType}->${call.methodName}(): expected <= ${chainedInfo.totalCount}, got ${cArgs}`;
                  if (!isAllowlisted(err)) defects.push(err);
                } else {
                  verifiedArities++;
                }
              }
              if (cNamed.length > 0 && chainedInfo.params) {
                const declaredNames = new Set(chainedInfo.params.map((p) => p.name));
                for (const na of cNamed) {
                  if (!declaredNames.has(na)) {
                    const err = `${file}: invalid named argument "${na}" on ${call.targetType}->${call.methodName}()`;
                    if (!isAllowlisted(err)) defects.push(err);
                  } else {
                    verifiedNamedArgs++;
                  }
                }
              }
            }
          }
        }
      }
    }
  }

  if (shouldExportManifest && defects.length === 0) {
    mkdirSync(dirname(manifestPath), { recursive: true });
    const payload = {
      classes: [...confirmedManifest.classes].sort(),
      methods: confirmedManifest.methods
    };
    writeFileSync(manifestPath, JSON.stringify(payload, null, 2));
    console.log(`[check-ast] exported AST signatures manifest with ${payload.classes.length} classes and ${Object.keys(payload.methods).length} signatures to ${manifestPath}`);
  }

  console.log(`=== AST PHP Code Analyzer ===`);
  console.log(`Inspected:            ${guideFiles.length} guides (${totalPhpBlocks} PHP blocks)`);
  console.log(`Instance calls:       ${verifiedInstanceCalls} / ${totalInstanceCalls} confirmed`);
  console.log(`Static calls:         ${verifiedStaticCalls} / ${totalStaticCalls} confirmed`);
  console.log(`Call arities checked: ${verifiedArities} verified`);
  console.log(`Named arguments:      ${verifiedNamedArgs} verified`);
  console.log(`Defects found:        ${defects.length}`);

  if (defects.length > 0) {
    console.error(`\n[FAIL] AST validation failed with ${defects.length} defect(s):`);
    for (const d of defects) {
      console.error(`  - ${d}`);
    }
    process.exit(1);
  }

  console.log(`\nStatus: PASS (0 defects)`);
  process.exit(0);
}

main();
