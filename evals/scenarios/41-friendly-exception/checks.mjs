import { check, ok, fail, read, filesMatching } from '../../lib/checks.mjs';

const php = (changed) => changed.filter((c) => c.path.endsWith('.php'));
const srcPhp = (changed) => php(changed).filter((c) => /^src\//.test(c.path));

/** A class declares the friendly contract: use-import + short `implements`, or a fully-qualified name in the implements clause.
 * Grounded: Yiisoft\FriendlyException\FriendlyExceptionInterface extends Throwable (references/friendly-exception/src/FriendlyExceptionInterface.php:15). */
const USE_FFI = /use\s+Yiisoft\\FriendlyException\\FriendlyExceptionInterface;/;
const IMPLEMENTS_FFI = /implements\s+[^{;]*\bFriendlyExceptionInterface\b/;
const FQ_IMPLEMENTS_FFI = /implements\s+[^{;]*\\Yiisoft\\FriendlyException\\FriendlyExceptionInterface\b/;

const implementingFiles = (changed) =>
  srcPhp(changed).filter((c) => {
    const t = read(c.abs);
    return IMPLEMENTS_FFI.test(t) && (USE_FFI.test(t) || FQ_IMPLEMENTS_FFI.test(t));
  });

/** Grounded method contract: getName(): string (:20) and getSolution(): ?string (:29). */
const GET_NAME = /public\s+function\s+getName\s*\(\s*\)\s*:\s*string\b/;
const GET_SOLUTION = /public\s+function\s+getSolution\s*\(\s*\)\s*:\s*\?string\b/;

/** The leaked fixture internals: DB constraint name plus user_id interpolation in the raw message. */
const LEAK = /failed for user_id|fk_order_customer/;
/** Internals tokens banned inside the friendly exception class itself (scoped: not applied to services, which may legitimately keep user ids as parameters). */
const INTERNAL_TOKENS = /\buser_id\b|fk_[a-z_]+|\bDB\b/;

/** throw new <FriendlyClass>(...) or throw <FriendlyClass>::forX(...) at the changed throwing site. */
const throwRe = (name) => new RegExp(`throw\\s+(?:new\\s+)?(?:\\\\?[A-Za-z_]\\w*\\\\)*${name}\\b`);

export default [
  check('friendly-interface-implemented', 'A changed src/ class implements Yiisoft\\FriendlyException\\FriendlyExceptionInterface (use-import + short implements, or fully-qualified)', ({ changed }) => {
    const hit = implementingFiles(changed);
    return hit.length
      ? ok(hit.map((h) => h.path).join(', '))
      : fail('no changed class implements FriendlyExceptionInterface - a generic exception rewrite is not the framework mechanism');
  }),

  check('friendly-name-provided', 'The class implementing FriendlyExceptionInterface provides getName(): string (grounded contract, references/friendly-exception/src/FriendlyExceptionInterface.php:20) - the human-readable title', ({ changed }) => {
    const hit = implementingFiles(changed).filter((c) => GET_NAME.test(read(c.abs)));
    return hit.length
      ? ok(hit.map((h) => h.path).join(', '))
      : fail('getName(): string is missing in the class implementing FriendlyExceptionInterface');
  }),

  check('solution-provided', 'The class implementing FriendlyExceptionInterface provides getSolution(): ?string (grounded contract, :29) that returns a string (literal or heredoc) - the suggested remediation', ({ changed }) => {
    const hit = implementingFiles(changed).filter((c) => {
      const t = read(c.abs);
      const m = t.match(GET_SOLUTION);
      return m !== null && /return\s+(?:['"]|<<<)/.test(t.slice(m.index));
    });
    return hit.length
      ? ok(hit.map((h) => h.path).join(', '))
      : fail('getSolution(): ?string is missing or does not return remediation text');
  }),

  check('friendly-exception-thrown', 'The changed throwing site throws the new friendly class (throw new <FriendlyClass> or a named constructor), instead of the old raw throw remaining in place', ({ changed }) => {
    const impl = implementingFiles(changed);
    if (!impl.length) return fail('no friendly exception class exists, so nothing friendly is thrown');
    const names = [...new Set(impl.flatMap((c) => [...read(c.abs).matchAll(/\bclass\s+(\w+)/g)].map((m) => m[1])))];
    const sites = php(changed).filter((c) => names.some((n) => throwRe(n).test(read(c.abs))));
    return sites.length
      ? ok(`${sites.map((s) => s.path).join(', ')} -> ${names.join(', ')}`)
      : fail(`the friendly class (${names.join(', ')}) is never thrown - the duplicate-order path still fails with the old raw exception`);
  }),

  check('no-internals-leak', 'No internal storage details remain in the changed code: the leaked fixture message (DB constraint name / "failed for user_id") is gone everywhere, and the friendly exception class itself carries no user_id/fk_*/DB tokens in its title, message or solution text', ({ changed }) => {
    const leakFiles = php(changed).filter((c) => LEAK.test(read(c.abs)));
    if (leakFiles.length) return fail(`the leaked internals are still present in: ${leakFiles.map((b) => b.path).join(', ')}`);
    const dirty = implementingFiles(changed).filter((c) => INTERNAL_TOKENS.test(read(c.abs)));
    return dirty.length
      ? fail(`internal detail tokens (user_id / fk_* / DB) inside the friendly exception class: ${dirty.map((b) => b.path).join(', ')}`)
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

  check('transcript-mentions-friendly', 'The transcript mentions the friendly exception mechanism and the solution guidance', ({ transcript }) => {
    if (!/friendly\s+exception|friendlyexception/i.test(transcript)) return fail('transcript does not mention the friendly exception mechanism');
    return /solution|remediation|what to do next/i.test(transcript) ? ok() : fail('transcript does not mention the suggested solution');
  }),

  check('error-handler-kept', 'The global ErrorCatcher wiring from the fixture is still present in config (the handler that renders friendly exceptions was not removed)', ({ dir }) => {
    const configs = filesMatching(dir, /^config\/.*\.php$/);
    return configs.some((p) => /ErrorCatcher/.test(read(p))) ? ok() : fail('ErrorCatcher no longer wired in config/');
  }, { required: false }),
];
