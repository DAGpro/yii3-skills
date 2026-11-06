import { check, ok, fail, read, matchParen } from '../../lib/checks.mjs';

const php = (changed) => changed.filter((c) => c.path.endsWith('.php'));
const src = (changed) => php(changed).filter((c) => /^src\//.test(c.path));
const config = (changed) => php(changed).filter((c) => /^config\//.test(c.path));

/** The PSR-16 store is bound to FileCache (persistent), overriding the shipped ArrayCache default.
 *  Accepts alias imports (PsrCacheInterface::class), fully-qualified interface names, plain-class
 *  and ['class' => ...] / closure definition values. The YiisoftCacheInterface alias must not match. */
const PSR_TO_FILECACHE = /(?<!Yiisoft)CacheInterface::class\s*=>\s*(?:(?:\[\s*)?(?:'class'\s*=>\s*)?\\?(?:Yiisoft\\Cache\\File\\)?FileCache::class|static\s*(?:fn|function)[^;]{0,300}FileCache)/s;

/** TTL of 900 seconds (15 minutes) in any grounded form: int, named arg, Ttl value object or DateInterval. */
const TTL_900 = /\b900\b|Ttl::(?:from\(900\)|minutes\(15\)|seconds\(900\))|PT15M|15\s*\*\s*60|15\s+minutes/;

export default [
  check('cache-interface-injected', 'A changed src/ service constructor-injects Yiisoft\\Cache\\CacheInterface (the Yii decorator), not PSR-16', ({ changed }) => {
    const hits = src(changed).map((c) => ({ path: c.path, t: read(c.abs) })).filter(({ t }) => {
      if (/\\?Yiisoft\\Cache\\CacheInterface\s+\$\w+/.test(t)) return true; // fully-qualified inline type
      const imp = t.match(/use\s+Yiisoft\\Cache\\CacheInterface(?:\s+as\s+(\w+))?\s*;/);
      if (!imp) return false;
      const ctor = t.match(/function\s+__construct\s*\(([^)]*)\)/);
      return ctor !== null && new RegExp(`\\b(?:CacheInterface|${imp[1] ?? 'CacheInterface'})\\s+\\$\\w+`).test(ctor[1]);
    });
    return hits.length ? ok(hits.map((h) => h.path).join(', ')) : fail('no changed src/ file constructor-injects Yiisoft\\Cache\\CacheInterface');
  }),

  check('getorset-pattern', 'Hot path is read through ->getOrSet(...) with the requested TTL of 900 seconds (or Ttl/DateInterval equivalents)', ({ changed }) => {
    const hits = src(changed).map((c) => ({ path: c.path, t: read(c.abs) })).filter(({ t }) => /->\s*getOrSet\s*\(/.test(t));
    if (!hits.length) return fail('no ->getOrSet( call found in changed src/ files');
    const good = [];
    for (const h of hits) {
      const m = /->\s*getOrSet\s*\(/.exec(h.t);
      const open = h.t.indexOf('(', m.index);
      const close = matchParen(h.t, open);
      const call = close === -1 ? h.t.slice(m.index, m.index + 600) : h.t.slice(m.index, close);
      if (TTL_900.test(call)) good.push(h.path);
    }
    return good.length ? ok(good.join(', ')) : fail('getOrSet() found but no 900-second TTL argument inside the call');
  }),

  check('cache-driver-bound', 'Persistent store wired in DI: the PSR-16 cache interface is bound to Yiisoft\\Cache\\File\\FileCache', ({ changed }) => {
    const hits = config(changed).filter((c) => PSR_TO_FILECACHE.test(read(c.abs)));
    return hits.length ? ok(hits.map((h) => h.path).join(', ')) : fail('no changed config file binds the PSR-16 cache interface to FileCache');
  }),

  check('no-raw-psr-in-service', 'No Psr\\SimpleCache\\CacheInterface type-hint in changed src/ code (services get the Yii CacheInterface)', ({ changed }) => {
    const re = /use\s+Psr\\SimpleCache\\CacheInterface;|\\Psr\\SimpleCache\\CacheInterface\s+\$|Psr\\SimpleCache\\CacheInterface\s+\$/;
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

  check('tests-added', 'Tests added (tests/**Test.php)', ({ changed }) =>
    changed.some((c) => c.added && /^tests\/.*Test\.php$/.test(c.path)) ? ok() : fail('no tests'), { required: false }),
];
