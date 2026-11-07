import { check, ok, fail, read, filesMatching, rel } from '../../lib/checks.mjs';

const php = (changed) => changed.filter((c) => c.path.endsWith('.php'));

/**
 * The user-facing strings the fixture hardcodes in the action and the view.
 * Per the prompt they must become translate() message IDs (English source = id,
 * the yiisoft/translator convention) and dictionary keys in messages/ru/app.php.
 */
const STRINGS = [
  'Contact us',
  'Message sent successfully',
  'Invalid email address',
  'We will get back to you soon.',
  'Email address',
  'Send message',
];

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** First string-literal argument of a ->translate(...) call - the message id (grounded: TranslatorInterface::translate(string|Stringable $id, ...)). */
const stripTranslateIds = (t) => t.replace(/->\s*translate\s*\(\s*(['"])(?:\\.|(?!\1).)*\1/gs, '->translate(');

/** The string used as a translate() message id anywhere in the text. */
const usedAsTranslateId = (t, s) => new RegExp(`translate\\s*\\(\\s*['"]${escapeRe(s)}['"]`).test(t);

export default [
  check('translator-injected', 'TranslatorInterface is constructor-injected in a changed src/ class (DI), and no manual `new Translator(...)` instantiation replaces it', ({ changed }) => {
    const src = php(changed).filter((c) => /^src\//.test(c.path)).map((c) => ({ path: c.path, t: read(c.abs) }));
    const manual = src.filter(({ t }) => /\bnew\s+\\?Yiisoft\\Translator\\Translator\s*\(|\bnew\s+Translator\s*\(/.test(t));
    if (manual.length) return fail(`manual Translator instantiation instead of DI: ${manual.map((m) => m.path).join(', ')}`);
    const injected = src.filter(({ t }) =>
      (/use\s+Yiisoft\\Translator\\TranslatorInterface;/.test(t) && /TranslatorInterface\s+\$\w+/.test(t))
      || /\bYiisoft\\Translator\\TranslatorInterface\s+\$\w+/.test(t));
    return injected.length
      ? ok(injected.map((i) => i.path).join(', '))
      : fail('no changed src/ class constructor-injects Yiisoft\\Translator\\TranslatorInterface');
  }),

  check('translate-calls', 'Every previously hardcoded string is now used as a translate() message id (grounded: TranslatorInterface::translate(string|Stringable $id, array $parameters = [], ?string $category = null, ?string $locale = null)) in changed src/ or views/ files', ({ changed }) => {
    const t = changed
      .filter((c) => /^(?:src|views)\//.test(c.path) && c.path.endsWith('.php'))
      .map((c) => read(c.abs)).join('\n');
    const missing = STRINGS.filter((s) => !usedAsTranslateId(t, s));
    return missing.length
      ? fail(`strings not passed through translate(): ${missing.join(', ')}`)
      : ok(`all ${STRINGS.length} strings translated`);
  }),

  check('no-hardcoded-literals', 'The extracted strings no longer appear as hardcoded user-facing text in src/ or views/ PHP files: every occurrence must be inside a translate() id argument (dictionary files under messages/ are excluded from this scan)', ({ dir }) => {
    const bad = [];
    for (const p of filesMatching(dir, /^(?:src|views)\/.+\.php$/)) {
      const found = STRINGS.filter((s) => stripTranslateIds(read(p)).includes(s));
      if (found.length) bad.push(`${rel(dir, p)}: ${found.join(' | ')}`);
    }
    return bad.length ? fail(`hardcoded user-facing strings remain outside translate() ids: ${bad.join('; ')}`) : ok();
  }),

  check('dictionary-ru', "PHP message dictionary messages/ru/app.php exists ({path}/{locale}/{category}.php layout, grounded: translator-message-php MessageSource::getFilePath()) and maps every extracted English string (as message id) to a Russian translation", ({ dir }) => {
    const dictPath = filesMatching(dir, /^messages\/ru\/app\.php$/)[0];
    if (!dictPath) return fail('no messages/ru/app.php - the PHP MessageSource reads {path}/{locale}/{category}.php');
    const t = read(dictPath);
    const missing = STRINGS.filter((s) => !new RegExp(`['"]${escapeRe(s)}['"]\\s*=>`).test(t));
    if (missing.length) return fail(`dictionary misses keys: ${missing.join(', ')}`);
    return !/\S/.test(t.replace(/<\?php|declare\(strict_types=1\);|return|\[|\]|\s|;/g, ''))
      ? fail('dictionary is empty')
      : ok('all extracted strings present as dictionary keys');
  }),

  check('config-message-source', "Config wires the PHP MessageSource for category 'app' into the container: a changed config file references the MessageSource class together with the 'app' category, and the source is discoverable by the translator via the 'translation.categorySource' tag or addCategorySources()", ({ changed }) => {
    const cfg = changed.filter((c) => /^config\/.*\.php$/.test(c.path)).map((c) => ({ path: c.path, t: read(c.abs) }));
    const wiring = cfg.filter(({ t }) => /\bMessageSource\b/.test(t) && /['"]app['"]/.test(t));
    if (!wiring.length) return fail("no changed config file registers the PHP MessageSource for category 'app'");
    const attached = wiring.filter(({ t }) => /translation\.categorySource|addCategorySources\s*\(/.test(t));
    return attached.length
      ? ok(attached.map((w) => w.path).join(', '))
      : fail(`CategorySource defined but not attached via 'translation.categorySource' tag or addCategorySources(): ${wiring.map((w) => w.path).join(', ')}`);
  }),

  check('no-yii2', 'No Yii2 constructs (Yii::t() static facade, Yii::$app, yii\\ namespace) in changed PHP files', ({ changed }) => {
    const re = /Yii::t\s*\(|Yii::\$app|\\Yii::|\buse\s+yii\\/;
    const bad = php(changed).filter((c) => re.test(read(c.abs)));
    return bad.length ? fail(bad.map((b) => b.path).join(', ')) : ok();
  }),

  check('strict-types', 'declare(strict_types=1) in every added PHP file', ({ changed }) => {
    const bad = php(changed).filter((c) => c.added && !/declare\(strict_types=1\);/.test(read(c.abs)));
    return bad.length ? fail(bad.map((b) => b.path).join(', ')) : ok();
  }),

  check('transcript-mentions', 'The transcript reports the translation work (translator, category, dictionary or message source)', ({ transcript }) =>
    /translat|dictionar|message source|messages\//i.test(transcript) ? ok() : fail('transcript does not mention the translation/dictionary work')),
];
