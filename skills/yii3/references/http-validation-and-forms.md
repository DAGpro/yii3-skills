# Yii3 Validation & Forms Guide

> [!IMPORTANT]
> **Grounding rule:** sources of truth are split by question type — API: installed `vendor/yiisoft/<pkg>/src/` (versions via `composer.lock`); implementation patterns: this guide; project conventions: the project's architecture artifact or dominant `src/` style. Full table and conflict rule: SKILL.md Core rule 2.

> Complete reference and architectural guide for input validation with `yiisoft/validator`, typed DTO hydration with `yiisoft/hydrator` and `yiisoft/hydrator-validator`, HTML form modeling and widget rendering with `yiisoft/form-model` and `yiisoft/form`, and PSR-7 request mapping with `yiisoft/input-http`.

This topic is split into three focused guides — load the one that matches the task:

- [Validation Rules: Core Engine & Rule Declaration](http-validation-rules.md) — package architecture, `ValidatorInterface` contract, `Result` API, exhaustive built-in rules catalog, declaring rules (attributes, ad-hoc, providers), execution modifiers & flow combinators (§1–§3).
- [Validation Rules: Advanced Usage](http-validation-advanced.md) — custom rules & handlers, file & image validation, cross-property comparison, messages/labels/i18n (§4–§7).
- [Forms & Typed DTO Hydration](http-forms-and-hydration.md) — `FormModel` + `FormHydrator` web form lifecycle, typed DTO hydration via `ValidatingHydrator`, PSR-7 request input mapping (§8–§10).

Read this file for the cross-cutting decision matrix, the anti-pattern matrix, and related guides.

---
## 11. Architectural Decision Matrix (Choosing the Right Tool)

| Scenario | Recommended Approach | Key Packages & Classes | Rationale |
|---|---|---|---|
| **JSON REST API Endpoint** | Typed DTO with `#[FromBody]` extending `AbstractInput` | `yiisoft/input-http`, `yiisoft/hydrator-validator`, `ValidatingHydrator` | Decoupled from HTML; maps directly into controller action signature; two-stage pre/post validation. |
| **Server-Rendered HTML Web Form** | `FormModel` + `FormHydrator::populateFromPostAndValidate()` | `yiisoft/form-model`, `yiisoft/form`, `yiisoft/csrf` | Scoped inputs (`Form[field]`), automatic HTML5 attribute enrichment, labels/hints metadata, CSRF support. |
| **Search / Filter Form (HTTP GET)** | `FormModel` + `FormHydrator::populateFromGetAndValidate(..., scope: '')` | `yiisoft/form-model`, `yiisoft/data` | Retains filter parameters in URL; flat query scoping prevents nested key mismatches. |
| **Complex Domain DTO / Value Object** | Constructor-promoted typed DTO + `#[Validate]` | `yiisoft/hydrator-validator`, `#[Validate]`, custom `TypeCasterInterface` | Ensures raw strings cannot trigger fatal `TypeError`s during instantiation; deep collection mapping. |
| **Ad-Hoc One-Off Validation** | `$validator->validate($data, $rules)` with plain array map | `yiisoft/validator`, `ValidatorInterface`, `Rule\*` | Fast, lightweight validation of decoded arrays without defining single-use classes. |
| **Domain Layer Invariant Enforcement** | Strict rules (`Rule\Type\*`) + Custom Rules | `yiisoft/validator`, `Rule\Type\*`, `RuleHandlerInterface` | Prevents HTTP string leniency (`"0"` &rarr; `false`) from corrupting domain logic. |
| **Route Parameters** | `CurrentRoute::getArgument()` + explicit rule validation | `yiisoft/router`, `CurrentRoute`, `ValidatorInterface` | `input-http` does not map route arguments; keeping route parameters distinct preserves clarity. |

---

## 12. Anti-Pattern Matrix

| Forbidden Anti-Pattern | Why It Breaks | Grounded Idiomatic Solution |
|---|---|---|
| **Assuming `Result` is an immutable value object** | `Result::addError()` mutates state in-place. Reusing instances contaminates distinct validations. | Treat `Result` as a mutable accumulator. Instantiate a fresh `new Result()` per validation pass. |
| **Calling non-existent `Result::isAttributeValid()`** | The term "attribute" was replaced with property in Yii 3. Method does not exist; throws fatal `Error: Call to undefined method`. | Call `Result::isPropertyValid(string $property): bool`. |
| **Passing `skipOnEmpty:` to `new Required()`** | `Required` constructor does NOT accept `$skipOnEmpty`. Causes fatal `Error: Unknown named parameter $skipOnEmpty`. | Only pass `message:`, `notPassedMessage:`, `emptyCondition:`, `skipOnError:`, `when:` to `Required`. |
| **Positional arguments in `new Length(3, 255)` or `new Count(1, 10)`** | First positional parameter is `$exactly`. Causes `exactly: 3, min: 255`. | Always use explicit PHP 8 named arguments: `new Length(min: 3, max: 255)` and `new Count(min: 1, max: 10)`. |
| **Using `$targetAttribute` in comparison rules** | Comparison rules inherit `AbstractCompare` which names the sibling property `$targetProperty`. | Pass `targetProperty: 'passwordConfirmation'` (or `targetValue:`). `$targetAttribute` throws PHP 8 argument error. |
| **Calling `FormModel::addError()` before validation** | Throws `LogicException: Validation result is not set.`. | Only add manual domain errors after `populate*AndValidate()` has executed; check `isValidated()`. |
| **Relying on `SimpleRuleHandlerContainer` with DI** | Default container uses `new $class()`. Handlers with dependencies fail with `ArgumentCountError`. | Rebind `RuleHandlerResolverInterface::class => RuleHandlerContainer::class` (see [Custom Validation Rules Guide](http-validation-custom-rules.md)). |
| **Calling non-existent `InputValidationException::getResponse()`** | Exception carries only `Result $result`. Does not generate HTTP responses. | Call `$exception->getResult()` and pass it to an RFC 7807 Problem Details responder or exception handler. |
| **Assuming `ValidationRulesEnricher` generates `accept` for files** | `ValidationRulesEnricher` only converts `Required` to `required` on `Field::file()`; ignores file extensions/types. | Set the `accept` attribute explicitly on the widget: `Field::file($form, 'doc')->accept('.pdf,image/*')`. |
| **Assuming `#[Request]` reads HTTP headers** | `#[Request]` strictly reads PSR-7 request **attributes** (`$request->getAttributes()`). | Read HTTP headers via PSR-7 `$request->getHeaderLine()`. There is no header attribute in `input-http`. |
| **Importing `#[Label]` from `yiisoft/form-model`** | `#[Label]` does NOT exist in `yiisoft/form-model`. Causes fatal `Class not found`. | Import `Yiisoft\Validator\Label`. Hints (`#[Hint]`), placeholders (`#[Placeholder]`), and safe markers come from `form-model`. |
| **Inventing phantom `SimplePropertyTranslator`** | Class does not exist in `yiisoft/validator`. | Use `NullPropertyTranslator`, `ArrayPropertyTranslator`, or `TranslatorPropertyTranslator`. |
| **Inventing `#[FromRoute]`, `#[FromHeader]`, `#[FromCookie]`** | Attributes do not exist in `yiisoft/input-http`. | Access route parameters via `CurrentRoute`, headers via `$request->getHeaderLine()`. |
| **Omitted `RequestBodyParser` middleware for JSON** | `$request->getParsedBody()` is `null`; hydration silently resolves an empty array. | Register `Yiisoft\Request\Body\RequestBodyParser` in the middleware pipeline prior to actions. |
| **Omitting `#[Required]` before `#[Length]`** | Built-in rules never skip empty values by default (`$skipOnEmpty` resolves to the `NeverEmpty` condition), so an empty input is still validated and fails follow-up rules — often with misleading messages (e.g. `Length` on a `null` value reports `{Property} must be a string.`). | Always place `#[Required]` first in the attribute list; to intentionally let empty values pass, set `skipOnEmpty: true` on the rule instead. |
| **Importing `NonArrayTypeCaster` from `yiisoft/hydrator`** | Class does not exist in `hydrator`. | Import `Yiisoft\FormModel\NonArrayTypeCaster` from `yiisoft/form-model`. |
| **Missing `yiisoft/translator-message-php` package** | Validator falls back to `IdMessageReader`, leaving system error messages untranslated. | Require `yiisoft/translator-message-php` in `composer.json` whenever multi-language validation is needed. |

---

## 13. Related Topic Guides

- [Custom Validation Rules & Testing](http-validation-custom-rules.md) — Dedicated guide for RuleInterface, RuleHandlerInterface, DI container wiring, compound rules, and isolated unit testing.

- [Actions & Controllers Guide](http-actions-and-controllers.md) — Hydrating DTOs and handling FormModels inside Web and API controllers.
- [Views, Layouts & Widgets Guide](http-views-and-widgets.md) — View rendering, asset management, and field widget configurations.
- [PSR-15 Middlewares Guide](http-middlewares.md) — Configuring `RequestBodyParser`, `CsrfTokenMiddleware`, and request pipeline ordering.
- [Routing Guide](http-routes.md) — Inspecting route parameters via `CurrentRoute`.
- [Error Handling Guide](infra-error-handling.md) — Centralized exception responders and Problem Details formatting.
- [Dependency Protocol](core-dependency-protocol.md) — Package dependency resolution and installation rules.