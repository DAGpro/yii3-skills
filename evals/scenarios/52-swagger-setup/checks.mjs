import { check, ok, fail, read, filesMatching, matchParen } from '../../lib/checks.mjs';

const php = (changed) => changed.filter((c) => c.path.endsWith('.php'));
const srcPhp = (changed) => php(changed).filter((c) => /^src\/.*\.php$/.test(c.path));

const composerFiles = (dir) => filesMatching(dir, /(^|\/)composer\.json$/);
const configPhp = (dir) => filesMatching(dir, /^config\/.*\.php$/);
const paramsFiles = (dir) => filesMatching(dir, /^config\/.*params[^/]*\.php$/);
const routeFiles = (dir) => filesMatching(dir, /^config\/.*routes[^/]*\.php$/);

/** The guide's verbatim attribute shape: `OA\` alias (use OpenApi\Attributes as OA) or the FQCN. */
const OA_INFO = /#\[\s*(?:(?:\\?OpenApi\\(?:Attributes|Annotations)\\)|OA\\)?Info\b/;
const OA_OPERATION = /#\[\s*(?:(?:\\?OpenApi\\(?:Attributes|Annotations)\\)|OA\\)?(?:Get|Post|Put|Patch|Delete)\b/;

/** Route constructor segments (paren-matched) in a routes config text. */
const routeDecls = (text) => {
  const decls = [];
  const re = /new\s+\\?(?:Yiisoft\\Router\\(?:Route\\)?)?(?:Get|Post)\s*\(/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const open = m.index + m[0].length - 1;
    const close = matchParen(text, open);
    decls.push({
      seg: text.slice(m.index, close === -1 ? open + 120 : close + 1),
      start: m.index,
      bodyStart: close === -1 ? open : close + 1,
    });
  }
  return decls;
};

export default [
  // Grounded: references/yii-swagger/composer.json:2 ("yiisoft/yii-swagger"); guide §2.1.
  check('swagger-package-required', 'composer.json requires yiisoft/yii-swagger - the spec generator, SwaggerUi/SwaggerJson handlers and SwaggerUiAsset all come from this package', ({ dir }) => {
    const hits = composerFiles(dir).filter((f) => /["']yiisoft\/yii-swagger["']\s*:/.test(read(f)));
    return hits.length
      ? ok(hits.join(', '))
      : fail('no composer.json requires yiisoft/yii-swagger');
  }),

  // Grounded param keys: references/yii-swagger/config/params.php:6-10 ('source-paths'); guide §3.2.
  // Route-level alternative: SwaggerJson::withPaths(string ...$paths) - references/yii-swagger/src/Action/SwaggerJson.php:44; guide §6.
  check('source-paths-configured', "The 'yiisoft/yii-swagger' params group configures 'source-paths' (or the SwaggerJson handler receives paths via withPaths in config) so generation scans the annotated classes", ({ dir, changed }) => {
    const paramHit = paramsFiles(dir).find((f) => {
      const t = read(f);
      return /['"]yiisoft\/yii-swagger['"]\s*=>/.test(t) && /['"]source-paths['"]\s*=>/.test(t);
    });
    if (paramHit) return ok(`${paramHit} (params source-paths)`);
    const withPaths = php(changed)
      .filter((c) => /^config\//.test(c.path))
      .filter((c) => /->\s*withPaths\s*\(/.test(read(c.abs)));
    if (withPaths.length) return ok(withPaths.map((w) => w.path).join(', ') + ' (withPaths in config)');
    return fail("no config declares the 'yiisoft/yii-swagger' params group with 'source-paths' (and no withPaths() wiring in config) - the generator would scan nothing and throw on empty paths");
  }),

  // Guide-as-contract (zircote/swagger-php is not cloned): http-openapi-endpoints.md §5.1 lines 23-37.
  check('openapi-info-block', 'An OpenAPI info block is declared as an attribute (#[OA\\Info] or the FQCN equivalent) carrying the API title/version metadata', ({ changed }) => {
    const hits = php(changed).filter((c) => OA_INFO.test(read(c.abs)));
    return hits.length
      ? ok(hits.map((h) => h.path).join(', '))
      : fail('no #[OA\\Info] attribute in any changed PHP file - the basic API info block is missing');
  }),

  // Guide-as-contract: http-openapi-endpoints.md §5.3.1 lines 152-183 (#\[OA\Get(...)] above __invoke).
  check('actions-annotated', 'At least one changed API action carries an OpenAPI operation attribute (#[OA\\Get]/#[OA\\Post]/...) so the spec is generated from the actions', ({ changed }) => {
    const hits = srcPhp(changed).filter((c) => OA_OPERATION.test(read(c.abs)));
    return hits.length
      ? ok(hits.map((h) => h.path).join(', '))
      : fail('no changed src/ action carries an OpenAPI operation attribute (#\\[OA\\Get] etc.)');
  }),

  // Grounded handlers: references/yii-swagger/src/Action/SwaggerJson.php:16, SwaggerUi.php:15; guide §4.1.
  check('docs-routes-added', 'Routes under /docs serve both handlers: SwaggerUi (interactive HTML) and SwaggerJson (raw spec) referenced in a routes config', ({ dir }) => {
    const hit = routeFiles(dir).find((f) => {
      const t = read(f);
      return /\bSwaggerUi\b/.test(t) && /\bSwaggerJson\b/.test(t) && /['"]\/docs/.test(t);
    });
    return hit
      ? ok(hit)
      : fail('no routes config references both SwaggerUi and SwaggerJson under a /docs path');
  }),

  // Guide §4.3 (lines 279-294): SwaggerJson::handle() must have JsonDataResponseMiddleware attached, else
  // "LogicException: Formatter is not set." at emission; deprecated FormatDataResponseAsJson must not be used.
  check('json-middleware-wired', 'JsonDataResponseMiddleware (yiisoft/data-response) is referenced in changed config - the spec route needs it attached or the JSON emission throws "Formatter is not set"', ({ changed }) => {
    const hits = php(changed)
      .filter((c) => /^config\//.test(c.path))
      .filter((c) => /\bJsonDataResponseMiddleware\b/.test(read(c.abs)));
    return hits.length
      ? ok(hits.map((h) => h.path).join(', '))
      : fail('JsonDataResponseMiddleware is not referenced in any changed config file - SwaggerJson responses cannot be emitted as JSON');
  }),

  // Grounded: references/yii-swagger/src/Asset/SwaggerUiAsset.php:12-13 (basePath '@assets', baseUrl '@assetsUrl');
  // guide §3.4 (lines 201-223): missing aliases throw "Invalid path alias: @assets".
  check('assets-aliases-declared', "The '@assets' and '@assetsUrl' aliases are declared in config - SwaggerUiAsset publishes the swagger-ui dist there and throws InvalidArgumentException without them", ({ dir }) => {
    const hit = configPhp(dir).find((f) => {
      const t = read(f);
      return /@assets\b/.test(t) && /@assetsUrl\b/.test(t);
    });
    return hit
      ? ok(hit)
      : fail("no config file declares the '@assets'/'@assetsUrl' aliases - SwaggerUiAsset publishing breaks with 'Invalid path alias'");
  }),

  // The spec must be generated from attributes at request time, not committed as a static data file.
  check('no-static-spec-file', 'No hand-written openapi.json/swagger.json (.json/.yaml) file was added - the spec is generated by SwaggerService::fetch() from the attributes', ({ dir }) => {
    const bad = filesMatching(dir, /(^|\/)(?:openapi|swagger)\.(?:json|ya?ml)$/);
    return bad.length
      ? fail(`static spec file(s) committed instead of generated: ${bad.join(', ')}`)
      : ok('no static openapi/swagger spec file in the work dir');
  }),

  // Router 4.0.3: 2nd positional ctor arg of Get/Post is the route NAME, not the handler.
  check('routes-named-action', 'Changed routes keep the grounded router 4.0.3 form: no legacy static API and every new Get/Post binds its handler via the named action: argument or ->action() (a positional second argument silently becomes the route NAME)', ({ changed }) => {
    const files = php(changed).filter((c) => /^config\/.*routes.*\.php$/.test(c.path));
    if (!files.length) return ok('routes not touched by the agent');
    for (const c of files) {
      const t = read(c.abs);
      if (/Route::(get|post|put|delete|patch|options)\s*\(|Group::create\s*\(/.test(t)) {
        return fail(`legacy static router API used in ${c.path} (deprecated since router 4.0.3)`);
      }
      const decls = routeDecls(t);
      for (let i = 0; i < decls.length; i++) {
        const d = decls[i];
        if (/\(\s*['"][^'"]*['"]\s*,\s*\\?[A-Z]/.test(d.seg)) {
          return fail(`positional action argument silently becomes the route NAME on router 4.0.3 - use the named action: argument in ${c.path}: ${d.seg.replace(/\s+/g, ' ').slice(0, 80)}`);
        }
        const nextStart = i + 1 < decls.length ? decls[i + 1].start : Math.min(d.bodyStart + 400, t.length);
        const bound = /\baction\s*:/.test(d.seg) || /->\s*action\s*\(/.test(t.slice(d.bodyStart, nextStart));
        if (!bound) {
          return fail(`route without an action binding (action: ... or ->action(...)) in ${c.path}: ${d.seg.replace(/\s+/g, ' ').slice(0, 80)}`);
        }
      }
    }
    return ok(files.map((f) => f.path).join(', '));
  }),

  check('no-yii2', 'No Yii2 constructs (Yii::$app, \\Yii::, yii\\ root namespace) in changed PHP files', ({ changed }) => {
    const re = /Yii::\$app|\\Yii::|\buse\s+yii\\/;
    const bad = php(changed).filter((c) => re.test(read(c.abs)));
    return bad.length ? fail(bad.map((b) => b.path).join(', ')) : ok();
  }),

  check('strict-types', 'declare(strict_types=1) present in every changed PHP file', ({ changed }) => {
    const bad = php(changed).filter((c) => !/declare\(strict_types=1\);/.test(read(c.abs)));
    return bad.length ? fail(bad.map((b) => b.path).join(', ')) : ok();
  }),

  check('transcript-mentions', 'The transcript reports the OpenAPI/Swagger setup (swagger or openapi)', ({ transcript }) =>
    /swagger|openapi/i.test(transcript) ? ok() : fail('transcript does not mention the swagger/openapi work')),
];
