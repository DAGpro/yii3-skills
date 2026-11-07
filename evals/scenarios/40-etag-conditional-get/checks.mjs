import { check, ok, fail, read } from '../../lib/checks.mjs';

const php = (changed) => changed.filter((c) => c.path.endsWith('.php'));
const srcPhp = (changed) => php(changed).filter((c) => /^src\//.test(c.path));

/** ETag response header set via the PSR-7 immutables. Grounded: Header::ETAG = 'ETag' (references/http/src/Header.php:109); guide §3 attaches it with ->withHeader(Header::ETAG, $etag). */
const ETAG_HEADER = /->\s*with(?:Added)?Header\s*\(\s*(?:\\?Yiisoft\\Http\\)?Header::ETAG\b|->\s*with(?:Added)?Header\s*\(\s*['"]ETag['"]/;

/** Incoming conditional header read. Grounded: Header::IF_NONE_MATCH = 'If-None-Match' (references/http/src/Header.php:125); guide §3 reads it via $request->getHeaderLine(Header::IF_NONE_MATCH). */
const INM_READ = /->\s*getHeaderLine\s*\(\s*(?:\\?Yiisoft\\Http\\)?Header::IF_NONE_MATCH\b|->\s*getHeaderLine\s*\(\s*['"]If-None-Match['"]|->\s*getHeader\s*\(\s*(?:\\?Yiisoft\\Http\\)?Header::IF_NONE_MATCH\b/;

/** 304 on the path. Grounded: Status::NOT_MODIFIED = 304 (references/http/src/Status.php:157). */
const NM_304 = /Status::NOT_MODIFIED|\b304\b/;

/**
 * 304 response built WITHOUT a payload. Guide §3 idiom: the plain PSR-17 factory
 * createResponse(Status::NOT_MODIFIED) (status = first/only argument, empty body);
 * a data factory (createResponse(mixed $data, int $code), grounded at
 * references/data-response/src/ResponseFactory/DataResponseFactoryInterface.php:25)
 * is only acceptable with an explicitly empty payload (null / [] / '').
 * Setting the status afterwards via withStatus() keeps the body empty too.
 */
const NM_EMPTY_BODY =
  /createResponse\s*\(\s*(?:\\?Yiisoft\\Http\\)?(?:Status::NOT_MODIFIED|\b304\b)|createResponse\s*\(\s*(?:null|\[\]|['"]{2})\s*,\s*(?:\\?Yiisoft\\Http\\)?(?:Status::NOT_MODIFIED|\b304\b)|withStatus\s*\(\s*(?:\\?Yiisoft\\Http\\)?(?:Status::NOT_MODIFIED|\b304\b)/;

/** Comparison of the client tag against the computed one (guide §3: strict ===; set-membership over parsed values also counts). */
const COMPARE = /===|!==|==|!=|str_contains|in_array/;

/** Fixture-provided tag source: CatalogRepositoryInterface::version() (prompt directs it; the tag must change when the data changes). */
const VERSION_CALL = /->\s*version\s*\(|::\s*version\s*\(/;

export default [
  check('etag-header-set', 'A changed PHP file sets the ETag response header (->withHeader(Header::ETAG, ...) or the \'ETag\' literal)', ({ changed }) => {
    const hit = php(changed).filter((c) => ETAG_HEADER.test(read(c.abs)));
    return hit.length ? ok(hit.map((h) => h.path).join(', ')) : fail('no changed PHP file sets the ETag response header (withHeader(Header::ETAG, ...) / withHeader(\'ETag\', ...))');
  }),

  check('if-none-match-compared', 'A changed src/ file reads the incoming If-None-Match (Header::IF_NONE_MATCH) and a comparison (===/!==/str_contains/in_array) follows the read in the same file', ({ changed }) => {
    const files = srcPhp(changed).map((c) => ({ path: c.path, t: read(c.abs) }));
    const readers = files.filter(({ t }) => INM_READ.test(t));
    if (!readers.length) return fail('no changed src/ file reads If-None-Match (getHeaderLine(Header::IF_NONE_MATCH)) - matched requests cannot be detected');
    const compared = readers.filter(({ t }) => COMPARE.test(t.slice(t.search(INM_READ))));
    return compared.length
      ? ok(compared.map((c) => c.path).join(', '))
      : fail('If-None-Match is read but never compared against the computed tag (no comparison operator after the read)');
  }),

  check('not-modified-returned', 'A changed PHP file returns 304 (Status::NOT_MODIFIED or the literal) - matched requests must stop re-sending the payload', ({ changed }) => {
    const hit = php(changed).filter((c) => NM_304.test(read(c.abs)));
    return hit.length ? ok(hit.map((h) => h.path).join(', ')) : fail('no 304 / Status::NOT_MODIFIED in changed PHP files - every request still returns 200 with the full body');
  }),

  check('not-modified-empty-body', 'The 304 response is built without a payload: guide §3 idiom createResponse(Status::NOT_MODIFIED) via the plain factory, or a data factory with an explicitly empty first argument (null/[]/\'\'), or withStatus(Status::NOT_MODIFIED). Text-heuristic tradeoff: scanned in the changed files that mention 304, not per-branch; whether the body-less call really sits on the match branch is left to the rubric', ({ changed }) => {
    const files = php(changed).filter((c) => NM_304.test(read(c.abs)));
    if (!files.length) return ok('no 304 in changed PHP files - covered by not-modified-returned');
    const joined = files.map((c) => read(c.abs)).join('\n');
    return NM_EMPTY_BODY.test(joined)
      ? ok()
      : fail('the 304 response is built with a payload argument - a 304 must carry no message body (guide §1/§3)');
  }),

  check('version-used-as-tag-source', 'The fixture-provided CatalogRepositoryInterface::version() is used in changed src/ as the ETag source (prompt directs it; a tag that does not change with the data breaks revalidation)', ({ changed }) => {
    const hit = srcPhp(changed).filter((c) => VERSION_CALL.test(read(c.abs)));
    return hit.length
      ? ok(hit.map((h) => h.path).join(', '))
      : fail('CatalogRepositoryInterface::version() is not called in changed src/ - the ETag must be derived from the catalog version');
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

  check('transcript-mentions-conditional-get', 'The transcript mentions both the ETag and the 304 / Not Modified revalidation behavior', ({ transcript }) => {
    if (!/etag/i.test(transcript)) return fail('transcript does not mention the ETag');
    return /304|not[\s-]?modified/i.test(transcript) ? ok() : fail('transcript does not mention the 304 / Not Modified revalidation');
  }),
];
