import { check, ok, fail, read } from '../../lib/checks.mjs';

const php = (changed) => changed.filter((c) => c.path.endsWith('.php'));
const srcPhp = (changed) => php(changed).filter((c) => /^src\//.test(c.path));

/**
 * Files plausibly on the listing data path: the action reading the list, the repository
 * feeding it, or a service paginating it. Deliberately name-agnostic (class names are
 * agent-chosen); covers paginator setup, data readers, raw queries and finder calls.
 * Includes withPageSize/withCurrentPage so pagination split across two files still lands
 * in the set.
 */
const LISTING_RE = /OffsetPaginator|KeysetPaginator|QueryDataReader|\bDataReader\b|new\s+\\?(?:Yiisoft\\Db\\Query\\)?Query\b|->all\s*\(|->limit\s*\(|->withLimit\s*\(|->withPageSize\s*\(|->withCurrentPage\s*\(|->findAll\s*\(|->find[A-Z]\w*\s*\(/;

/** Paginator instantiation: use-import + short form or fully-qualified form. */
const PAGINATOR_NEW = /\bnew\s+\\?(?:Yiisoft\\Data\\Paginator\\)?(?:OffsetPaginator|KeysetPaginator)\s*\(/;

/** Explicit bound on the query chain: Query::limit() (grounded: references/db Query::limit(ExpressionInterface|int|null): static) or the data reader's withLimit() (grounded: QueryDataReader::withLimit(?int): static). */
const LIMIT_CALL = /->\s*(?:withLimit|limit)\s*\(/;

const WITH_PAGE_SIZE = /->\s*withPageSize\s*\(/;

const listingFiles = (changed) =>
  srcPhp(changed).map((c) => ({ path: c.path, t: read(c.abs) })).filter(({ t }) => LISTING_RE.test(t));

export default [
  check('listing-bounded', 'The listing data path is bounded: an OffsetPaginator/KeysetPaginator is instantiated on it, or the query chain carries an explicit ->limit()/->withLimit()', ({ changed }) => {
    const files = listingFiles(changed);
    if (!files.length) return fail('no changed src/ file on the listing data path');
    const bounded = files.filter(({ t }) => PAGINATOR_NEW.test(t) || LIMIT_CALL.test(t));
    return bounded.length
      ? ok(bounded.map((b) => b.path).join(', '))
      : fail('listing path: no OffsetPaginator/KeysetPaginator instantiation and no ->limit()/->withLimit() anywhere');
  }),

  check('paginator-page-size', 'If a paginator is instantiated on the listing path, the page size is set explicitly via ->withPageSize() (otherwise the library default of 10 applies silently); vacuously passes for the explicit-limit variant', ({ changed }) => {
    const files = listingFiles(changed);
    const paged = files.filter(({ t }) => PAGINATOR_NEW.test(t));
    if (!paged.length) return ok('no paginator on the listing path - explicit-limit variant, page-size rule not applicable');
    return files.some(({ t }) => WITH_PAGE_SIZE.test(t))
      ? ok(paged.map((b) => b.path).join(', '))
      : fail(`paginator instantiated without ->withPageSize(): ${paged.map((b) => b.path).join(', ')}`);
  }),

  check('no-unbounded-all', 'No ->all() on the listing path without a preceding ->limit()/->withLimit() in the same file. Text-heuristic tradeoff (conservative): only changed src/ files detected as listing-path are scanned, and any earlier limit call in the same file counts as the bound (covers a query built in a variable above); a limit applied in a different file is invisible to a text check and left to the rubric', ({ changed }) => {
    const bad = [];
    for (const f of listingFiles(changed)) {
      const allRe = /->\s*all\s*\(/g;
      let m;
      while ((m = allRe.exec(f.t)) !== null) {
        if (!LIMIT_CALL.test(f.t.slice(0, m.index))) {
          bad.push(f.path);
          break;
        }
      }
    }
    return bad.length ? fail(`unbounded ->all() (no preceding limit in the same file): ${bad.join(', ')}`) : ok();
  }),

  check('route-added', 'GET /posts route declared via new Route\\Get(...) (lock pins router 4.0.3)', ({ changed }) => {
    const routes = changed.filter((c) => /^config\/.*routes.*\.php$/.test(c.path)).map((c) => read(c.abs)).join('\n');
    if (/Route::(get|post|put|delete|patch)\s*\(|Group::create\s*\(/.test(routes)) return fail('legacy static router API used');
    return /new\s+\\?(?:Yiisoft\\Router\\Route\\)?Get\s*\(\s*['"]\/posts['"]/.test(routes) ? ok() : fail('no new Get(\'/posts\')');
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
