import { check, ok, fail, read, filesMatching } from '../../lib/checks.mjs';

const php = (changed) => changed.filter((c) => c.path.endsWith('.php'));
const srcPhp = (changed) => php(changed).filter((c) => /^src\/.*\.php$/.test(c.path));

/** Changed classes implementing PSR-15 MiddlewareInterface (import + short implements, or FQCN) - scenario 16 idiom. */
const middlewares = (changed) =>
  srcPhp(changed)
    .map((c) => ({ path: c.path, t: read(c.abs) }))
    .map((f) => ({ ...f, name: f.t.match(/class\s+(\w+)[^{;]*implements\s+[^;{]*\bMiddlewareInterface\b/)?.[1] ?? '' }))
    .filter((m) => m.name !== '');

/** References to the grounded i18n value object / provider: use import or fully-qualified (grounded: references/i18n/src/LocaleProvider.php:11, references/i18n/src/Locale.php:15). */
const I18N_REF = /\\?Yiisoft\\I18n\\(?:LocaleProvider|Locale)\b/;

/** Global middleware pipeline configs (guide: config/{web,common}/di/application.php). */
const pipelineFiles = (dir) => filesMatching(dir, /^config\/(?:web|common)\/di\/[^/]+\.php$/);

/** Slice of the middlewareDefinitions array body (bracket-matched), where list order = pipeline order (scenario 23 idiom). */
const middlewareSlice = (text) => {
  const k = text.indexOf('middlewareDefinitions');
  if (k === -1) return '';
  const open = text.indexOf('[', k);
  if (open === -1) return '';
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === '[') depth++;
    else if (text[i] === ']' && --depth === 0) return text.slice(open, i);
  }
  return text.slice(open);
};

export default [
  check('middleware-implements-interface', 'A changed class implements PSR-15 Psr\\Http\\Server\\MiddlewareInterface (guide http-middlewares.md §1: all Yii3 middlewares implement MiddlewareInterface) - the fixture LocaleMiddleware placeholder is implemented', ({ changed }) => {
    const hits = middlewares(changed);
    return hits.length ? ok(hits.map((m) => m.path).join(', ')) : fail('no changed class implements MiddlewareInterface (the LocaleMiddleware placeholder is still empty)');
  }),

  check('process-signature', 'process(ServerRequestInterface, RequestHandlerInterface): ResponseInterface signature shape (grounded shape: http-middlewares.md §1 MiddlewareInterface; scenario 16 check idiom)', ({ changed }) => {
    const hits = middlewares(changed).filter(({ t }) => {
      const m = t.match(/public\s+function\s+process\s*\(([\s\S]*?)\)\s*:\s*([\w\\]+)/);
      return m !== null && /ServerRequestInterface/.test(m[1]) && /RequestHandlerInterface/.test(m[1])
        && /ResponseInterface$/.test(m[2].replace(/^\\/, ''));
    });
    return hits.length ? ok(hits.map((m) => m.path).join(', ')) : fail('no process() with the PSR-15 signature');
  }),

  check('locale-provider-used', 'The locale is exposed through the grounded provider: a changed src/ class references Yiisoft\\I18n\\LocaleProvider/Locale and injects the provider or calls ->set(new Locale(...)) (grounded: references/i18n/src/LocaleProvider.php:14-16 ctor (private Locale $defaultLocale), :23-26 set(Locale $locale): void)', ({ changed }) => {
    const files = srcPhp(changed)
      .map((c) => ({ path: c.path, t: read(c.abs) }))
      .filter(({ t }) => I18N_REF.test(t));
    if (!files.length) return fail('no changed src/ file references Yiisoft\\I18n\\LocaleProvider or Yiisoft\\I18n\\Locale');
    const exposed = files.filter(({ t }) =>
      /LocaleProvider\s+\$\w+/.test(t)
      || /->\s*set\s*\(\s*new\s+\\?(?:Yiisoft\\I18n\\)?Locale\s*\(/.test(t));
    return exposed.length
      ? ok(exposed.map((e) => e.path).join(', '))
      : fail('Locale/LocaleProvider referenced but never injected and ->set(new Locale(...)) never called');
  }),

  check('locale-provider-wired', 'LocaleProvider is wired in DI with a default Locale in a changed config file (the yiisoft/i18n package ships no DI config - guide §6.1)', ({ changed }) => {
    const configs = changed
      .filter((c) => /^config\/.*\.php$/.test(c.path))
      .map((c) => ({ path: c.path, t: read(c.abs) }))
      .filter(({ t }) => /LocaleProvider::class/.test(t));
    if (!configs.length) return fail('no changed config file defines LocaleProvider::class (yiisoft/i18n ships no DI config)');
    const complete = configs.filter(({ t }) => /\\?Yiisoft\\I18n\\Locale\b|defaultLocale/.test(t));
    return complete.length
      ? ok(complete.map((c) => c.path).join(', '))
      : fail('LocaleProvider::class referenced in config but no default Locale (constructor requires one)');
  }),

  check('middleware-wired', 'The locale middleware is registered in the global Application middleware stack (dispatcher middlewareDefinitions in config/{web,common}/di), listed before Router (guide §6.4 pipeline invariant: locale resolution must precede route matching)', ({ dir, changed }) => {
    const names = middlewares(changed).map((m) => m.name);
    if (!names.length) return fail('no MiddlewareInterface implementation found');
    for (const n of names) {
      for (const f of pipelineFiles(dir)) {
        const slice = middlewareSlice(read(f));
        const idx = slice.indexOf(`${n}::class`);
        if (idx === -1) continue;
        const router = slice.indexOf('Router::class');
        if (router === -1) return fail(`${n} registered in ${f} but Router::class is missing from the stack`);
        return idx < router
          ? ok(`${n} registered in ${f} before Router`)
          : fail(`${n} must precede Router in the stack (first-listed = outermost) - ${f}`);
      }
    }
    return fail(`none of [${names.join(', ')}] appears in a dispatcher middlewareDefinitions list`);
  }),

  check('no-global-locale-mutation', 'No global locale mutation: TranslatorInterface::setLocale() (grounded: references/translator/src/TranslatorInterface.php:26) is never called in changed src/ or views/ - per-request locale flows through LocaleProvider instead (guide §6.2 invariant: the resolution path does not write the locale into the stateful translator)', ({ changed }) => {
    const bad = php(changed)
      .filter((c) => /^(?:src|views)\//.test(c.path))
      .filter((c) => /->\s*setLocale\s*\(/.test(read(c.abs)))
      .map((c) => c.path);
    return bad.length
      ? fail(`setLocale() called (global mutation of the shared translator): ${bad.join(', ')}`)
      : ok();
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

  check('transcript-mentions', 'The transcript reports the locale resolution work (middleware, locale provider or per-request locale)', ({ transcript }) =>
    /locale|provider|middleware/i.test(transcript) ? ok() : fail('transcript does not mention the locale resolution work')),
];
