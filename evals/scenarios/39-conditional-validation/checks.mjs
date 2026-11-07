import { check, ok, fail, read, filesMatching } from '../../lib/checks.mjs';

const php = (changed) => changed.filter((c) => c.path.endsWith('.php'));

/** A changed form model (FormModel subclass) — grounded: references/form-model/src/FormModel.php:36. */
const formModels = (changed) =>
  php(changed).map((c) => ({ path: c.path, t: read(c.abs) }))
    .filter(({ t }) => /extends\s+\\?(?:Yiisoft\\FormModel\\)?FormModel\b/.test(t));

/**
 * The rules-array entry text for a key (`'couponCode' => [ ... ]` up to its matching bracket) or,
 * when the entry is not bracketed, up to the entry-terminating comma at depth 0. Quoted spans are
 * skipped so message strings cannot unbalance the scan.
 */
const rulesEntry = (t, key) => {
  const m = new RegExp(`['"]${key}['"]\\s*=>\\s*`).exec(t);
  if (!m) return null;
  const start = m.index + m[0].length;
  let i = start;
  while (i < t.length && /\s/.test(t[i])) i++;
  if (i >= t.length) return null;
  let depth = 0, q = null, opened = false;
  for (; i < t.length; i++) {
    const ch = t[i];
    if (q) { if (ch === '\\') i++; else if (ch === q) q = null; continue; }
    if (ch === '\'' || ch === '"') { q = ch; continue; }
    if (ch === '(' || ch === '[' || ch === '{') { depth++; opened = true; continue; }
    if (ch === ')' || ch === ']' || ch === '}') {
      depth--;
      if (opened && depth <= 0) return t.slice(start, i + 1);
      continue;
    }
    if (ch === ',' && depth === 0) return t.slice(start, i);
  }
  return t.slice(start);
};

/**
 * Fallback zone for attribute-based forms: the text block right above the property declaration
 * (`#[Required(...)]` style attributes sit there).
 */
const attributeZone = (t, prop) => {
  const m = new RegExp(`\\n[^\\n]*\\$${prop}\\b`).exec(t);
  if (!m) return null;
  const before = t.slice(Math.max(0, m.index - 600), m.index);
  const lastBreak = Math.max(before.lastIndexOf(';'), before.lastIndexOf('{'));
  return before.slice(lastBreak + 1);
};

/** The conditional construct the validator ships: `when:` named argument or `->when()` immutable
 * setter (WhenInterface — references/validator/src/WhenInterface.php:18/:32; WhenTrait —
 * references/validator/src/Rule/Trait/WhenTrait.php:31; Required ctor `?Closure $when = null` —
 * references/validator/src/Rule/Required.php:83), the WhenInterface/WhenTrait imports, or the
 * one-off Callback rule (guide http-validation-advanced.md §4/§6.3; Rule/Callback.php:31). */
const WHEN_MECHANISM = /when\s*:|->\s*when\s*\(|use\s+Yiisoft\\Validator\\(?:Rule\\Trait\\)?When(?:Interface|Trait);|new\s+(?:\\?[\w\\]+\\)?Callback\s*\(|use\s+Yiisoft\\Validator\\Rule\\Callback;/;

/** A Required rule without any condition attached. */
const BARE_REQUIRED = /\bnew\s+(?:\\?[\w\\]+\\)?Required\s*\(\s*\)/;

/** Coupon validation logic inlined into an action file (the anti-pattern the prompt forbids). */
const INLINE_COUPON = /if\s*\([^;{}]*coupon|addError\s*\(\s*['"][^'"]*coupon/i;

export default [
  // Grounded: guide http-validation-advanced.md §4 (WhenInterface) and §6.3 (dataset inspection);
  // references/validator/src/WhenInterface.php:18-38, references/validator/src/Validator.php:270-271.
  check('conditional-rule-used', 'The changed form model uses the validator conditional-rule mechanism: a when: closure / ->when() setter / WhenInterface|WhenTrait usage / Callback rule', ({ changed }) => {
    const models = formModels(changed);
    if (!models.length) return fail('no changed form model (FormModel subclass) found');
    const hit = models.filter(({ t }) => WHEN_MECHANISM.test(t));
    return hit.length
      ? ok(hit.map((h) => h.path).join(', '))
      : fail('no conditional mechanism (when/Callback/WhenInterface) in the changed form model');
  }),

  // Grounded: Required ctor carries `private ?Closure $when = null` — references/validator/src/Rule/Required.php:78-86;
  // the sibling field is read via DataSetInterface::getPropertyValue — references/validator/src/DataSetInterface.php:19
  // (guide §6.3 example reads 'country' the same way, http-validation-advanced.md:281-285).
  check('coupon-requirement-conditional', 'The couponCode requirement lives under the conditional construct in the form model: the couponCode rules entry (rules array key or attribute block above the property) contains a Required rule together with a when-condition, and no bare/unconditional Required', ({ changed }) => {
    const models = formModels(changed);
    if (!models.length) return fail('no changed form model (FormModel subclass) found');
    for (const { path, t } of models) {
      const zone = rulesEntry(t, 'couponCode') ?? attributeZone(t, 'couponCode');
      if (zone === null) return fail(`${path}: no couponCode rules entry or property declaration found`);
      const hasRequired = /\bRequired\b/.test(zone);
      const hasWhen = /when\s*:|->\s*when\s*\(|\bfn\s*\(|\bfunction\s*\(/.test(zone);
      if (hasRequired && hasWhen && !BARE_REQUIRED.test(zone)) return ok(path);
    }
    return fail('couponCode is not conditionally required: no Required-with-when in its rules entry (or an unconditional Required remains)');
  }),

  // Task requirement: "otherwise it must be optional and nullable".
  check('coupon-nullable', 'couponCode is declared nullable in the changed form model (public ?string $couponCode)', ({ changed }) => {
    const hit = formModels(changed).filter(({ t }) => /public\s+\?string\s+\$couponCode/.test(t));
    return hit.length ? ok(hit.map((h) => h.path).join(', ')) : fail('couponCode is not nullable (?string) in the changed form model');
  }),

  check('hascoupon-field-declared', 'The hasCoupon boolean field is still declared on the form model', ({ changed }) => {
    const hit = formModels(changed).filter(({ t }) => /public\s+\??bool\s+\$hasCoupon/.test(t));
    return hit.length ? ok(hit.map((h) => h.path).join(', ')) : fail('hasCoupon boolean field missing from the changed form model');
  }),

  // Grounded: FormHydrator::populateFromPostAndValidate(FormModelInterface, ServerRequestInterface, ...): bool —
  // references/form-model/src/FormHydrator.php:235. Scoped to *Action.php files so the form model may legitimately
  // contain the conditional construct (same scoping style as scenario 32).
  check('no-inline-validation-in-action', 'Actions keep delegating: populateFromPostAndValidate is still called and no coupon condition (if over coupon/hasCoupon or addError(\'couponCode\')) is inlined in any *Action.php', ({ dir }) => {
    const actions = filesMatching(dir, /Action\.php$/).map((p) => ({ path: p, t: read(p) }));
    if (!actions.length) return fail('no action file found');
    if (!actions.some(({ t }) => /->\s*populateFromPostAndValidate\s*\(/.test(t))) {
      return fail('populateFromPostAndValidate() no longer called by any action - form hydration path broken');
    }
    const bad = actions.filter(({ t }) => INLINE_COUPON.test(t));
    return bad.length
      ? fail(`coupon logic inlined in the action instead of a conditional rule: ${bad.map((b) => b.path).join(', ')}`)
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

  check('transcript-mentions-conditional', 'The transcript reports the conditional rule on the form model (conditional/when mechanism), not an action-side check', ({ transcript }) => {
    return /\bconditional\b|when\s*(?:-|:|\()?|WhenInterface/i.test(transcript)
      ? ok()
      : fail('transcript does not mention the conditional rule mechanism');
  }),
];
