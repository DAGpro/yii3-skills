import { check, ok, fail, read, filesMatching } from '../../lib/checks.mjs';

const php = (changed) => changed.filter((c) => c.path.endsWith('.php'));
const srcPhp = (changed) => php(changed).filter((c) => /^src\/.*\.php$/.test(c.path));

/** A class declaration implementing Yiisoft\Validator\RuleInterface (or DumpedRuleInterface, which extends it —
 * grounded: references/validator/src/DumpedRuleInterface.php:12), via import + short name or fully-qualified name
 * (same predicate style as exemplar 13). */
const implementsRule = (t) =>
  /use\s+Yiisoft\\Validator\\(?:Dumped)?RuleInterface;/.test(t)
    ? /implements\s+[^;{]*\b(?:Dumped)?RuleInterface\b/.test(t)
    : /implements\s+[^;{]*\\Yiisoft\\Validator\\(?:Dumped)?RuleInterface\b/.test(t);

/** A class declaration implementing Yiisoft\Validator\RuleHandlerInterface plus the grounded validate() contract
 * `validate(mixed $value, RuleInterface $rule, ValidationContext $context): Result`
 * (grounded: references/validator/src/RuleHandlerInterface.php:53). */
const implementsHandler = (t) =>
  (/use\s+Yiisoft\\Validator\\RuleHandlerInterface;/.test(t)
    ? /implements\s+[^;{]*\bRuleHandlerInterface\b/.test(t)
    : /implements\s+[^;{]*\\Yiisoft\\Validator\\RuleHandlerInterface\b/.test(t))
  && /function\s+validate\s*\(/.test(t);

/** Short class name of a RuleHandlerInterface implementation. */
const handlerClassName = (t) => t.match(/class\s+(\w+)\s+implements\s+[^;{]*RuleHandlerInterface/)?.[1] ?? null;

/** Short class name of a RuleInterface implementation. */
const ruleClassName = (t) => t.match(/class\s+(\w+)\s+implements\s+[^;{]*(?:Dumped)?RuleInterface/)?.[1] ?? null;

/** The reserved-username list inlined as executable logic (the anti-pattern; the grounded shape keeps it
 * as rule options consumed by the handler). */
const INLINE_RESERVED = /in_array\s*\([^;]*['"]admin['"]|\[\s*['"]admin['"]\s*,\s*['"]root['"]|(?:str_contains|str_starts_with|str_ends_with)\s*\([^;]*['"]admin['"]/s;

export default [
  // Grounded: RuleInterface::getHandler(): string|RuleHandlerInterface — references/validator/src/RuleInterface.php:25;
  // guide http-validation-custom-rules.md §2.1 (rule value object + #[Attribute]).
  check('rule-implements-interface', 'A new rule class implements Yiisoft\\Validator\\RuleInterface (or DumpedRuleInterface) as an options-only value object', ({ changed }) => {
    const rules = srcPhp(changed).map((c) => ({ path: c.path, t: read(c.abs) })).filter(({ t }) => implementsRule(t));
    return rules.length
      ? ok(rules.map((r) => r.path).join(', '))
      : fail('no changed src/ class implements Yiisoft\\Validator\\RuleInterface');
  }),

  // Grounded: RuleHandlerInterface::validate(mixed, RuleInterface, ValidationContext): Result —
  // references/validator/src/RuleHandlerInterface.php:53; guide §3.1 (handler + UnexpectedRuleException guard).
  check('handler-implements-interface', 'A new rule handler class implements Yiisoft\\Validator\\RuleHandlerInterface with the validate(mixed, RuleInterface, ValidationContext): Result contract', ({ changed }) => {
    const handlers = srcPhp(changed).map((c) => ({ path: c.path, t: read(c.abs) })).filter(({ t }) => implementsHandler(t));
    return handlers.length
      ? ok(handlers.map((h) => h.path).join(', '))
      : fail('no changed src/ class implements Yiisoft\\Validator\\RuleHandlerInterface with a validate() method');
  }),

  // Grounded: getHandler() may return the handler class-string or an instance — both are consumed by
  // references/validator/src/Validator.php:203-206 ($ruleHandlerResolver->resolve($ruleHandler) on string).
  check('rule-return-handler', 'The rule declares getHandler() and it resolves to the handler class (::class string or new instance)', ({ changed }) => {
    const handlerFiles = srcPhp(changed).map((c) => read(c.abs)).filter(implementsHandler);
    if (!handlerFiles.length) return fail('no rule handler class found (nothing for getHandler() to return)');
    const handlerShort = handlerClassName(handlerFiles[0]);
    const ruleFiles = srcPhp(changed).map((c) => ({ path: c.path, t: read(c.abs) })).filter(({ t }) => implementsRule(t));
    const bound = ruleFiles.filter(({ t }) => /function\s+getHandler\s*\(/.test(t)
      && (new RegExp(`\\b${handlerShort}\\s*::\\s*class\\b`).test(t)
        || new RegExp(`new\\s+(?:\\\\?[\\w\\\\]+\\\\)?${handlerShort}\\s*\\(`).test(t)));
    return bound.length
      ? ok(bound.map((b) => b.path).join(', '))
      : fail(`getHandler() not declared or does not return the handler (${handlerShort}) as ::class or instance`);
  }),

  // Grounded: rules reach the form model via the rules array (RulesProviderInterface::getRules(): iterable —
  // references/validator/src/RulesProviderInterface.php:19, consumed by references/validator/src/Helper/RulesNormalizer.php:168-169)
  // or as a property attribute parsed from RuleInterface implementations
  // (references/validator/src/Helper/ObjectParser.php:229-232); guide http-validation-custom-rules.md §2.1/§6.2.
  check('rule-wired-in-form-model', 'The form model (FormModel subclass) references the custom rule class - as a property attribute #[Rule] or inside its rules array (new Rule / Rule::class)', ({ changed }) => {
    const ruleFiles = srcPhp(changed).map((c) => read(c.abs)).filter(implementsRule);
    if (!ruleFiles.length) return fail('no rule class found to wire into the form model');
    const ruleShort = ruleClassName(ruleFiles[0]);
    const models = srcPhp(changed).map((c) => ({ path: c.path, t: read(c.abs) }))
      .filter(({ t }) => /extends\s+\\?(?:Yiisoft\\FormModel\\)?FormModel\b/.test(t));
    if (!models.length) return fail('no changed form model (FormModel subclass) found');
    const wired = models.filter(({ t }) => new RegExp(`new\\s+(?:\\\\?[\\w\\\\]+\\\\)?${ruleShort}\\s*\\(`).test(t)
      || new RegExp(`#\\[\\s*\\\\?(?:[\\w\\\\]+\\\\)?${ruleShort}\\b`).test(t)
      || new RegExp(`\\b${ruleShort}\\s*::\\s*class\\b`).test(t));
    return wired.length
      ? ok(wired.map((w) => w.path).join(', '))
      : fail(`custom rule (${ruleShort}) never referenced by the changed form model (attribute or rules array)`);
  }),

  // Grounded: FormHydrator::populateFromPostAndValidate(FormModelInterface, ServerRequestInterface, ...): bool —
  // references/form-model/src/FormHydrator.php:235. The ban is scoped to *Action.php files; the rule class and its
  // handler legitimately contain the reserved-word list as rule options.
  check('no-inline-validation-in-action', 'Actions keep delegating: populateFromPostAndValidate is still used and no reserved-username list check is inlined in any *Action.php (in_array/str_contains over \'admin\'-style literals)', ({ dir }) => {
    const actions = filesMatching(dir, /Action\.php$/).map((p) => ({ path: p, t: read(p) }));
    if (!actions.length) return fail('no action file found');
    if (!actions.some(({ t }) => /->\s*populateFromPostAndValidate\s*\(/.test(t))) {
      return fail('populateFromPostAndValidate() no longer called by any action - form hydration path broken');
    }
    const bad = actions.filter(({ t }) => INLINE_RESERVED.test(t));
    return bad.length
      ? fail(`reserved-username logic inlined in the action instead of a reusable rule: ${bad.map((b) => b.path).join(', ')}`)
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

  check('transcript-mentions-rule-handler', 'The transcript reports the reusable rule + handler implementation', ({ transcript }) => {
    return (/\brule\b/i.test(transcript) && /\bhandler\b/i.test(transcript))
      ? ok()
      : fail('transcript does not mention the custom rule and its handler');
  }),
];
