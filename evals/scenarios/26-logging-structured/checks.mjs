import { check, ok, fail, read, filesMatching, matchParen } from '../../lib/checks.mjs';

const php = (changed) => changed.filter((c) => c.path.endsWith('.php'));
const src = (changed) => php(changed).filter((c) => /^src\//.test(c.path));

/** A constructor argument type-hints Psr\Log\LoggerInterface (use-import + short hint, or FQCN). */
const injectsPsrLogger = (t) =>
  (/use\s+Psr\\Log\\LoggerInterface\s*;/.test(t) && /function\s+__construct\s*\([^)]*\bLoggerInterface\s+\$\w+/.test(t))
  || /\\Psr\\Log\\LoggerInterface\s+\$\w+/.test(t);

/** The concrete Yiisoft\Log\Logger is type-hinted (import + short hint, or FQCN).
 *  Does not match LoggerInterface: the import regex requires the `;` right after
 *  Logger and the FQCN regex requires whitespace after Logger. */
const hintsConcreteLogger = (t) =>
  (/use\s+Yiisoft\\Log\\Logger\s*;/.test(t) && /function\s+__construct\s*\([^)]*\bLogger\s+\$\w+/.test(t))
  || /Yiisoft\\Log\\Logger\s+\$\w+/.test(t);

const PSR_LOG_CALL = /->\s*(?:log|emergency|alert|critical|error|warning|notice|info|debug)\s*\(/g;

/** Source ranges of catch blocks: [openBraceIndex, closeBraceIndex] each (brace-counting heuristic). */
function catchRanges(t) {
  const out = [];
  const re = /catch\s*\([^)]*\)\s*\{/g;
  let m;
  while ((m = re.exec(t)) !== null) {
    const open = re.lastIndex - 1;
    let depth = 0;
    for (let i = open; i < t.length; i++) {
      if (t[i] === '{') depth++;
      else if (t[i] === '}' && --depth === 0) { out.push([open, i]); break; }
    }
  }
  return out;
}

/** Argument substring of the call whose opening paren position is given. */
const callArgs = (t, nameIdx) => {
  const open = t.indexOf('(', nameIdx);
  const close = matchParen(t, open);
  return close === -1 ? t.slice(nameIdx, nameIdx + 800) : t.slice(nameIdx, close);
};

/** Structured context keys required by the task: operation name + invoice id. */
const OPERATION_KEY = /['"](operation|op|action|task)['"]\s*=>/;
const INVOICE_KEY = /['"](invoiceId|invoice_id|invoice)['"]\s*=>/;

export default [
  check('logger-interface-injected', 'A changed src/ service constructor-injects Psr\\Log\\LoggerInterface', ({ changed }) => {
    const hits = src(changed).map((c) => ({ path: c.path, t: read(c.abs) })).filter(({ t }) => injectsPsrLogger(t));
    return hits.length ? ok(hits.map((h) => h.path).join(', ')) : fail('no changed src/ file constructor-injects Psr\\Log\\LoggerInterface');
  }),

  check('no-concrete-logger-hint', 'No concrete Yiisoft\\Log\\Logger type-hint in changed src/ code (services depend on the PSR-3 interface)', ({ changed }) => {
    const bad = src(changed).filter((c) => hintsConcreteLogger(read(c.abs)));
    return bad.length ? fail(bad.map((b) => b.path).join(', ')) : ok();
  }),

  check('failure-path-logs', 'The failure path logs: a PSR-3 log call sits inside a catch block of a changed src/ service', ({ changed }) => {
    const hits = [];
    for (const c of src(changed)) {
      const t = read(c.abs);
      const logCalls = [...t.matchAll(PSR_LOG_CALL)].map((m) => m.index);
      if (logCalls.length && catchRanges(t).some(([from, to]) => logCalls.some((i) => i > from && i < to))) hits.push(c.path);
    }
    return hits.length ? ok(hits.join(', ')) : fail('no log call inside a catch block in changed src/ files');
  }),

  check('warning-with-context', 'A warning-level call passes a structured context array with the operation name and the invoice id', ({ changed }) => {
    const good = [];
    for (const c of src(changed)) {
      const t = read(c.abs);
      const args = [
        ...[...t.matchAll(/->\s*warning\s*\(/g)].map((m) => callArgs(t, m.index)),
        ...[...t.matchAll(/->\s*log\s*\(\s*(?:\\?Psr\\Log\\)?LogLevel::WARNING|->\s*log\s*\(\s*['"]warning['"]/g)].map((m) => callArgs(t, m.index)),
      ];
      if (args.some((a) => OPERATION_KEY.test(a) && INVOICE_KEY.test(a))) good.push(c.path);
    }
    return good.length ? ok(good.join(', ')) : fail('no warning call with operation + invoice id context keys found in changed src/');
  }),

  check('filetarget-config', 'config wires FileTarget and points it at runtime/logs/app.log (own definition or params consumed by the package config)', ({ dir }) => {
    const cfg = filesMatching(dir, /^config\/.*\.php$/).map(read).join('\n');
    const target = /FileTarget/.test(cfg);
    const path = /runtime\/logs\/app\.log/.test(cfg);
    return target && path
      ? ok()
      : fail(target ? 'FileTarget found under config/ but no runtime/logs/app.log path' : 'no FileTarget referenced under config/');
  }),

  check('no-error-log-echo', 'No error_log()/echo/var_dump/print_r debugging output in changed src/ files', ({ changed }) => {
    const re = /\berror_log\s*\(|\bvar_dump\s*\(|\bprint_r\s*\(|\becho\s+['"]|\becho\s+\$/;
    const bad = src(changed).filter((c) => re.test(read(c.abs)));
    return bad.length ? fail(bad.map((b) => b.path).join(', ')) : ok();
  }),

  check('no-yii2', 'No Yii2 constructs or #[Override] in changed PHP files', ({ changed }) => {
    const re = /Yii::\$app|\buse\s+yii\\|#\[Override\]|ActiveForm::begin|->getFlash\(/;
    const bad = php(changed).filter((c) => re.test(read(c.abs)));
    return bad.length ? fail(bad.map((b) => b.path).join(', ')) : ok();
  }),

  check('strict-types', 'declare(strict_types=1) in every added PHP file', ({ changed }) => {
    const bad = php(changed).filter((c) => c.added && !/declare\(strict_types=1\);/.test(read(c.abs)));
    return bad.length ? fail(bad.map((b) => b.path).join(', ')) : ok();
  }),

  check('transcript-structured-context', 'The answer mentions structured context (what gets logged with the warning)', ({ transcript }) =>
    /structured/i.test(transcript) && /context/i.test(transcript) ? ok() : fail('transcript does not mention structured context')),
];
