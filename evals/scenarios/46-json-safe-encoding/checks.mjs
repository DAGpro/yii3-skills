import { check, ok, fail, read } from '../../lib/checks.mjs';

const php = (changed) => changed.filter((c) => c.path.endsWith('.php'));
const srcPhp = (changed) => php(changed).filter((c) => /^src\/.*\.php$/.test(c.path));

/** Strip block comments and full-line comments so ban patterns never hit prose. */
const codeOnly = (t) =>
  t
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !/^\s*(\/\/|#|\*)/.test(line))
    .join('\n');

/** {path, code} pairs for every changed src/ PHP file. */
const changedSrcCode = (changed) => srcPhp(changed).map((c) => ({ path: c.path, code: codeOnly(read(c.abs)) }));

/** Json::encode( / Json::decode( / Json::htmlEncode( - short imported name or fully qualified. */
const HELPER = (method) => new RegExp(`(?:\\\\Yiisoft\\\\Json\\\\)?Json::${method}\\s*\\(`);

export default [
  check('json-helper-used', 'Json::encode() (Yiisoft\\Json\\Json, imported or fully qualified) is used in the changed export path', ({ changed }) => {
    const hits = changedSrcCode(changed).filter((f) => HELPER('encode').test(f.code));
    return hits.length ? ok(hits.map((h) => h.path).join(', ')) : fail('no changed src file calls Json::encode()');
  }),

  check('json-decode-helper-used', 'Json::decode() is used at the changed decoding site (stored JSON column)', ({ changed }) => {
    const hits = changedSrcCode(changed).filter((f) => HELPER('decode').test(f.code));
    return hits.length ? ok(hits.map((h) => h.path).join(', ')) : fail('no changed src file calls Json::decode()');
  }),

  check('no-raw-json-functions', 'No raw json_encode()/json_decode() calls remain in changed src/ files', ({ changed }) => {
    const bad = changedSrcCode(changed).filter((f) => /json_(?:encode|decode)\s*\(/.test(f.code));
    return bad.length ? fail(bad.map((b) => b.path).join(', ')) : ok();
  }),

  check('htmlencode-in-script-context', 'The changed file that embeds JSON into a <script> tag encodes the payload with Json::htmlEncode()', ({ changed }) => {
    const files = changedSrcCode(changed);
    const hits = files.filter((f) => HELPER('htmlEncode').test(f.code));
    if (!hits.length) return fail('no changed src file calls Json::htmlEncode()');
    const scriptFiles = files.filter((f) => /<script/.test(f.code));
    const unencoded = scriptFiles.filter((f) => !HELPER('htmlEncode').test(f.code));
    return unencoded.length
      ? fail(`file(s) embed a <script> tag without Json::htmlEncode(): ${unencoded.map((u) => u.path).join(', ')}`)
      : ok(hits.map((h) => h.path).join(', '));
  }),

  check('no-handrolled-escaping', 'No hand-rolled escaping of the embedded payload (str_replace/addslashes/\\u003c tricks) in changed src/ files', ({ changed }) => {
    const bad = changedSrcCode(changed).filter((f) =>
      /str_replace\s*\(\s*['"]<|addslashes\s*\(|u003[ct]|preg_replace\s*\([^)]*script/i.test(f.code));
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

  check('transcript-mentions-safe-json', 'The answer names the HTML-encode defense for script-tag payloads and the safe JSON helper', ({ transcript }) => {
    if (!/html\s*-?\s*encode/i.test(transcript)) return fail('transcript does not mention HTML-encoding the embedded payload');
    return /Json::|yiisoft\/json|exception\s*-?\s*safe/i.test(transcript)
      ? ok()
      : fail('transcript does not mention the framework JSON helper');
  }),

  check('tests-added', 'Tests added (tests/**Test.php)', ({ changed }) =>
    changed.some((c) => c.added && /^tests\/.*Test\.php$/.test(c.path)) ? ok() : fail('no tests'), { required: false }),
];
