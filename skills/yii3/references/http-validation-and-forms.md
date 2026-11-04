# Yii3 Validation & Forms Guide

> Complete reference and architectural guide for input validation with `yiisoft/validator`, typed DTO hydration with `yiisoft/hydrator` and `yiisoft/hydrator-validator`, HTML form modeling and widget rendering with `yiisoft/form-model` and `yiisoft/form`, and PSR-7 request mapping with `yiisoft/input-http`.

---

## Table of Contents
- [1. Package Architecture & Responsibilities](#1-package-architecture--responsibilities)
- [2. Core Validation Engine (`yiisoft/validator`)](#2-core-validation-engine-yiisoftvalidator)
  - [2.1. ValidatorInterface Contract](#21-validatorinterface-contract)
  - [2.2. Result API & Mutable Accumulator](#22-result-api--mutable-accumulator)
  - [2.3. Exhaustive Built-In Rules Catalog](#23-exhaustive-built-in-rules-catalog)
  - [2.4. Lenient HTTP Input Rules vs. Strict Domain Type Rules](#24-lenient-http-input-rules-vs-strict-domain-type-rules)
- [3. Declaring Rules & Validation Flow Modifiers](#3-declaring-rules--validation-flow-modifiers)
  - [3.1. Repeatable PHP Attributes](#31-repeatable-php-attributes)
  - [3.2. Ad-Hoc Rules, Class Strings & RulesProviderInterface](#32-ad-hoc-rules-class-strings--rulesproviderinterface)
  - [3.3. Execution Modifiers: skipOnEmpty, skipOnError, when](#33-execution-modifiers-skiponempty-skiponerror-when)
  - [3.4. Flow Control Combinators: StopOnError, AnyRule, Composite](#34-flow-control-combinators-stoponerror-anyrule-composite)
- [4. Custom Rules & Rule Handlers](#4-custom-rules--rule-handlers)
- [5. File & Image Validation](#5-file--image-validation)
  - [5.1. File Rule & Safe Post-Validation Storage](#51-file-rule--safe-post-validation-storage)
  - [5.2. Image & Aspect Ratio Rules (`Rule\Image\Image`, `ImageAspectRatio`)](#52-image--aspect-ratio-rules-ruleimageimage-imageaspectratio)
  - [5.3. Validating PSR-7 UploadedFileInterface & Multi-File Collections](#53-validating-psr-7-uploadedfileinterface--multi-file-collections)
- [6. Cross-Property Validation & Contextual Comparison](#6-cross-property-validation--contextual-comparison)
  - [6.1. Comparison Rules: targetProperty vs. targetValue](#61-comparison-rules-targetproperty-vs-targetvalue)
  - [6.2. Cross-Property Cardinality: FilledAtLeast, FilledOnlyOneOf](#62-cross-property-cardinality-filledatleast-filledonlyoneof)
  - [6.3. Dynamic Context Inspection via ValidationContext](#63-dynamic-context-inspection-via-validationcontext)
- [7. Messages, Labels, Placeholders & Internationalization](#7-messages-labels-placeholders--internationalization)
  - [7.1. Translation Category 'yii-validator' & TranslatorMessagePhp Requirement](#71-translation-category-yii-validator--translatormessagephp-requirement)
  - [7.2. Placeholder Substitution: {Property}, {value}, and Parameter Tokens](#72-placeholder-substitution-property-value-and-parameter-tokens)
  - [7.3. Property Labels via #[Label] and Property Translators](#73-property-labels-via-label-and-property-translators)
  - [7.4. Message Formatters: SimpleMessageFormatter vs. IntlMessageFormatter](#74-message-formatters-simplemessageformatter-vs-intlmessageformatter)
- [8. Form Models & Web Form Lifecycle (`yiisoft/form-model` & `yiisoft/form`)](#8-form-models--web-form-lifecycle-yiisoftform-model--yiisoftform)
  - [8.1. FormModel Base Class & FormModelInterface Contract](#81-formmodel-base-class--formmodelinterface-contract)
  - [8.2. FormHydrator: Population, GET/POST Scoping, and Mass-Assignment Protection](#82-formhydrator-population-getpost-scoping-and-mass-assignment-protection)
  - [8.3. Web Form Architecture & Presentation Boundaries](#83-web-form-architecture--presentation-boundaries)
  - [8.4. Validation Rules HTML5 Enrichment (ValidationRulesEnricher)](#84-validation-rules-html5-enrichment-validationrulesenricher)
- [9. Typed DTO Hydration & ValidatingHydrator (`yiisoft/hydrator`, `yiisoft/hydrator-validator`)](#9-typed-dto-hydration--validatinghydrator-yiisofthydrator-yiisofthydrator-validator)
  - [9.1. Hydrator Architecture, Built-in EnumTypeCaster & Composite Type Casting](#91-hydrator-architecture-built-in-enumtypecaster--composite-type-casting)
  - [9.2. Two-Stage Validation via ValidatingHydrator & #[Validate]](#92-two-stage-validation-via-validatinghydrator--validate)
  - [9.3. Nested DTOs & Collections (OrderDto & OrderItemDto)](#93-nested-dtos--collections-orderdto--orderitemdto)
  - [9.4. Parameter Attributes Catalog & Custom TypeCasters](#94-parameter-attributes-catalog--custom-typecasters)
- [10. HTTP Request Inputs Mapping (`yiisoft/input-http`)](#10-http-request-inputs-mapping-yiisoftinput-http)
- [11. Architectural Decision Matrix (Choosing the Right Tool)](#11-architectural-decision-matrix-choosing-the-right-tool)
- [12. Anti-Pattern Matrix](#12-anti-pattern-matrix)
- [13. Related Topic Guides](#13-related-topic-guides)

---

## 1. Package Architecture & Responsibilities

In Yii 3, validation, object hydration, form modeling, and HTTP request parsing are deliberately decoupled into dedicated, focused packages. Applications install only what their architecture requires (see [Dependency Protocol](core-dependency-protocol.md)).

```
+---------------------------------------------------------------------------------------+
|                                    HTTP Layer                                         |
|  [yiisoft/request-body-parser]  -->  [yiisoft/csrf]  -->  [yiisoft/input-http]        |
|  (Parses application/json)          (CSRF protection)    (Maps PSR-7 to Action DTOs)  |
+---------------------------------------------------------------------------------------+
                                           |
                                           v
+---------------------------------------------------------------------------------------+
|                                 Hydration & DTO Layer                                 |
|  [yiisoft/hydrator]                <---+---> [yiisoft/hydrator-validator]             |
|  (Type casting, parameters, DI)        |     (Two-stage DTO validation decorator)     |
|                                        |                                              |
|                                        +---> [yiisoft/form-model]                     |
|                                              (Scoped hydration, mass-assignment guard)|
+---------------------------------------------------------------------------------------+
                                           |
                                           v
+---------------------------------------------------------------------------------------+
|                                  Core Validation Layer                                |
|  [yiisoft/validator]                                                                  |
|  (Rule attributes, RuleHandlerInterface, ValidationContext, Result accumulator)       |
|  [yiisoft/translator] (Category 'yii-validator' with ICU / simple formatting)         |
+---------------------------------------------------------------------------------------+
                                           |
                                           v
+---------------------------------------------------------------------------------------+
|                                 Presentation / Widget Layer                           |
|  [yiisoft/form]                                                                       |
|  (Model-agnostic PureField\Field widgets & form rendering engine)                     |
|  [yiisoft/form-model] Field facade & ValidationRulesEnricher (HTML5 attributes)       |
+---------------------------------------------------------------------------------------+
```

| Package | Role | Key Entry Points | Target Project Source |
|---|---|---|---|
| `yiisoft/validator` | Rule definitions, rule handlers, validation engine, `Result` accumulator, and `Error` value objects | `ValidatorInterface`, `Rule\*`, `Result`, `Error`, `ValidationContext` | `vendor/yiisoft/validator/src/` |
| `yiisoft/hydrator` | Creates and populates typed objects from arrays with composite type casting, parameter attributes, and DI resolution | `HydratorInterface::create()`, `hydrate()`, `TypeCasterInterface` | `vendor/yiisoft/hydrator/src/` |
| `yiisoft/hydrator-validator` | Decorator that validates raw input before hydration, populates typed properties, and validates the resulting object; stores `Result` on the DTO | `ValidatingHydrator`, `ValidatedInputInterface`, `ValidatedInputTrait`, `#[Validate]` | `vendor/yiisoft/hydrator-validator/src/` |
| `yiisoft/form-model` | Base class and scoped hydrator for HTML forms, metadata attributes (`#[Hint]`, `#[Placeholder]`, `#[Safe]`), field shortcut facade `Field`, and HTML5 validation enricher | `FormModel`, `FormModelInterface`, `FormHydrator`, `Field`, `ValidationRulesEnricher` | `vendor/yiisoft/form-model/src/` |
| `yiisoft/form` | Model-agnostic HTML form widgets and tag generators (independent of validator and hydrator) | `Yiisoft\Form\PureField\Field`, individual field widgets | `vendor/yiisoft/form/src/` |
| `yiisoft/input-http` | Maps incoming PSR-7 request data (`Body`, `Query`, `UploadedFiles`, `Request` attributes) directly into typed action parameters via middleware dispatcher | `AbstractInput`, `#[FromBody]`, `#[FromQuery]`, `RequestInputParametersResolver`, `HydratorAttributeParametersResolver` | `vendor/yiisoft/input-http/src/` |
| `yiisoft/request-body-parser` | PSR-15 middleware that parses raw HTTP bodies (such as `application/json`) into `$request->getParsedBody()` | `RequestBodyParser`, `JsonParser` | `vendor/yiisoft/request-body-parser/src/` |
| `yiisoft/csrf` | CSRF token generation, validation middleware, and masking. Note: `CsrfTokenMiddleware` is the canonical middleware; `CsrfMiddleware` is `@deprecated` | `CsrfTokenMiddleware`, `CsrfTokenInterface` | `vendor/yiisoft/csrf/src/` |
| `yiisoft/translator` | Message translation and placeholder formatting engine | `TranslatorInterface`, `SimpleMessageFormatter`, `IntlMessageFormatter` | `vendor/yiisoft/translator/src/` |

> [!IMPORTANT]
> To parse JSON request bodies (`application/json`), the PSR-15 middleware `Yiisoft\Request\Body\RequestBodyParser` from `yiisoft/request-body-parser` must be placed in the middleware pipeline before any action or input resolver. If omitted, `$request->getParsedBody()` returns `null` for JSON requests, causing `FromBodyResolver` to silently resolve an empty array `[]`. See [PSR-15 Middlewares Guide](http-middlewares.md).

---

## 2. Core Validation Engine (`yiisoft/validator`)

### 2.1. ValidatorInterface Contract

The single entry point of `yiisoft/validator` is `Yiisoft\Validator\ValidatorInterface` (`vendor/yiisoft/validator/src/ValidatorInterface.php`):

```php
declare(strict_types=1);

namespace Yiisoft\Validator;

interface ValidatorInterface
{
    /**
     * Validates data against a set of rules.
     *
     * @param mixed $data Data to validate (scalar, array, object, DataSetInterface, or RulesProviderInterface).
     * @param callable|iterable|object|string|null $rules Rules to apply. If null, extracted from $data.
     * @param ValidationContext|null $context Optional validation context.
     *
     * @return Result Validation result containing accumulated errors.
     */
    public function validate(
        mixed $data,
        callable|iterable|object|string|null $rules = null,
        ?ValidationContext $context = null,
    ): Result;
}
```

- **Dependency Injection Invariant:** Always inject `Yiisoft\Validator\ValidatorInterface`. Never instantiate `new Yiisoft\Validator\Validator(...)` manually in application code; manual instantiation bypasses container-configured translation categories, property translators, and rule handler resolvers.
- **Data Normalization:** The engine normalizes `$data` via `Yiisoft\Validator\Helper\DataSetNormalizer`:
  - Scalars are wrapped into `SingleValueDataSet`.
  - Associative arrays are wrapped into `ArrayDataSet`.
  - Objects are wrapped into `ObjectDataSet`.
  - Objects implementing `Yiisoft\Validator\RulesProviderInterface` supply their own rules when `$rules === null`.
- **Rules Precedence:** Explicitly passing `$rules` to `validate()` takes precedence over rules declared directly on `$data` (attributes or `getRules()`), enabling scenario-based overrides.
- **Post-Validation Hook:** If `$data` implements `Yiisoft\Validator\PostValidationHookInterface` (such as `FormModel` or `ValidatedInputInterface`), `Validator::validate()` automatically calls `$data->processValidationResult($result)`.

### 2.2. Result API & Mutable Accumulator

> [!CAUTION]
> `Yiisoft\Validator\Result` is a **MUTABLE ERROR ACCUMULATOR**, not an immutable value object.
> Methods such as `addError()`, `addErrorWithFormatOnly()`, `addErrorWithoutPostProcessing()`, and `add()` mutate the internal `$this->errors` array in-place and return `$this` for method chaining. Reusing a single `Result` instance across separate validation runs will contaminate results with stale errors.

The primary inspection methods of `Result` (`vendor/yiisoft/validator/src/Result.php`):

| Method | Return Type | Semantics & Primary Usage |
|---|---|---|
| `isValid()` | `bool` | Returns `true` if there are no errors in the accumulator (`$this->errors === []`). |
| `isPropertyValid(string $property)` | `bool` | Returns `true` if no errors exist whose value path begins with `$property`. *(Note: `isAttributeValid` DOES NOT EXIST).* |
| `getErrors()` | `list<Error>` | Returns the raw list of `Yiisoft\Validator\Error` value objects. |
| `getErrorMessages()` | `list<string>` | Returns a flat list of translated error message strings. |
| `getErrorMessagesIndexedByPath(string $separator = '.', ?string $escape = '.')` | `array<string, non-empty-list<string>>` | Groups error messages by dot-separated path (e.g. `['items.0.price' => ['Price must be at least 1.']]`). **Standard format for REST APIs (RFC 7807).** |
| `getFirstErrorMessagesIndexedByPath(string $separator = '.', ?string $escape = '.')` | `array<string, string>` | Returns the first error message string per dot-separated path. |
| `getErrorMessagesIndexedByProperty()` | `array<string, non-empty-list<string>>` | Groups error messages by root property name. *(Note: `getErrorMessagesIndexedByAttribute` DOES NOT EXIST).* |
| `getFirstErrorMessagesIndexedByProperty()` | `array<string, string>` | Returns the first error message string per root property name. **Standard format for server-rendered HTML forms.** |
| `getPropertyErrorMessages(string $property)` | `list<string>` | Returns all error message strings associated with a single property. |
| `getCommonErrorMessages()` | `list<string>` | Returns general error messages not bound to any property path. *(Note: `getCommonErrors` DOES NOT EXIST).* |

Each `Yiisoft\Validator\Error` value object exposes:
- `getMessage(): string` — the translated or formatted error message.
- `getParameters(): array` — the parameter key-value pairs passed for translation substitution.
- `getValuePath(?string $escape = null): array` — the path array identifying the nested property (e.g. `['items', 0, 'price']`).
- `getMessageProcessing(): int` — message processing mode (`Error::MESSAGE_TRANSLATE`, `Error::MESSAGE_FORMAT`, `Error::MESSAGE_NONE`).

### 2.3. Exhaustive Built-In Rules Catalog

`yiisoft/validator` ships 42 built-in rule classes. All concrete rule classes are PHP attributes marked `#[Attribute(Attribute::TARGET_PROPERTY | Attribute::IS_REPEATABLE)]`.

> [!IMPORTANT]
> **PHP 8 Named Arguments Mandate & Positional Traps:**
> 1. **`Required` has NO `$skipOnEmpty` parameter:** Calling `new Required(skipOnEmpty: ...)` throws a fatal `Error: Unknown named parameter $skipOnEmpty`. Its constructor accepts `$message`, `$notPassedMessage`, `$emptyCondition`, `$skipOnError`, and `$when`.
> 2. **Positional Parameter Trap in `Length` and `Count`:** The first positional parameter of both `Length` and `Count` is `$exactly`, followed by `$min` and `$max`. Calling `new Length(3, 255)` evaluates to `exactly: 3, min: 255`! Always use named arguments: `new Length(min: 3, max: 255)` or `new Count(min: 1, max: 10)`.
> 3. **Comparison Rules use `$targetProperty`:** The target field in `Equal`, `NotEqual`, `GreaterThan`, etc., is named strictly `$targetProperty` (or `$targetValue`). The legacy Yii 2 name `$targetAttribute` does not exist and throws an `Error: Unknown named parameter`.
> 4. **Named Arguments Required for Complex Rules:** Built-in rules like `Each`, `Nested`, `Compare`, and `Image` place message templates or reflection parameters before functional options in their positional sequences (e.g. `$stopOnError` is parameter #7 in `Each`, and 8 message parameters precede `$skipOnEmpty` in `Image`). Always configure rule options via explicit PHP 8 named arguments (e.g. `new Each([new Integer()], stopOnError: true)`).

#### 1. Requiredness Rule
| Rule Class | FQCN | Constructor Parameters & Defaults | Modifiers Supported | Handler Class |
|---|---|---|---|---|
| `Required` | `Yiisoft\Validator\Rule\Required` | `string $message = '{Property} cannot be blank.'`, `string $notPassedMessage = '{Property} not passed.'`, `?callable $emptyCondition = null`, `bool $skipOnError = false`, `?Closure $when = null` | `skipOnError`, `when` (**NO `skipOnEmpty`**) | `RequiredHandler` |

#### 2. Lenient Scalar Rules (Ideal for HTTP Strings)
| Rule Class | FQCN | Constructor Parameters & Defaults | Modifiers Supported | Handler Class |
|---|---|---|---|---|
| `StringValue` | `Yiisoft\Validator\Rule\StringValue` | `string $message = '{Property} must be a string.'`, `mixed $skipOnEmpty = null`, `bool $skipOnError = false`, `?Closure $when = null` | `skipOnEmpty`, `skipOnError`, `when` | `StringValueHandler` |
| `BooleanValue` | `Yiisoft\Validator\Rule\BooleanValue` | `mixed $trueValue = '1'`, `mixed $falseValue = '0'`, `bool $strict = false`, `string $message = 'The value of {property} must be either "{true}" or "{false}".'`, `mixed $skipOnEmpty = null`, `bool $skipOnError = false`, `?Closure $when = null` | `skipOnEmpty`, `skipOnError`, `when` | `BooleanValueHandler` |
| `Integer` | `Yiisoft\Validator\Rule\Integer` | `float\|int\|null $min = null`, `float\|int\|null $max = null`, `string $pattern = '/^\s*[+-]?\d+\s*$/'`, `mixed $skipOnEmpty = null`, `bool $skipOnError = false`, `?Closure $when = null` | `skipOnEmpty`, `skipOnError`, `when` | `NumberHandler` |
| `Number` | `Yiisoft\Validator\Rule\Number` | `float\|int\|null $min = null`, `float\|int\|null $max = null`, `string $pattern = '/^\s*[-+]?\d*\.?\d+([eE][-+]?\d+)?\s*$/'`, `mixed $skipOnEmpty = null`, `bool $skipOnError = false`, `?Closure $when = null` | `skipOnEmpty`, `skipOnError`, `when` | `NumberHandler` |
| `TrueValue` | `Yiisoft\Validator\Rule\TrueValue` | `mixed $trueValue = '1'`, `bool $strict = false`, `string $message = 'The value of {property} must be "{true}".'`, `mixed $skipOnEmpty = null`, `bool $skipOnError = false`, `?Closure $when = null` | `skipOnEmpty`, `skipOnError`, `when` | `TrueValueHandler` |

#### 3. Strict Native Type Rules (`Rule\Type\*`, for Domain Invariants)
| Rule Class | FQCN | Constructor Parameters & Defaults | Modifiers Supported | Handler Class |
|---|---|---|---|---|
| `StringType` | `Yiisoft\Validator\Rule\Type\StringType` | `string $message = '{Property} must be a string. {type} given.'`, `mixed $skipOnEmpty = null`, `bool $skipOnError = false`, `?Closure $when = null` | `skipOnEmpty`, `skipOnError`, `when` | `StringTypeHandler` |
| `IntegerType` | `Yiisoft\Validator\Rule\Type\IntegerType` | `string $message = '{Property} must be an integer. {type} given.'`, `mixed $skipOnEmpty = null`, `bool $skipOnError = false`, `?Closure $when = null` | `skipOnEmpty`, `skipOnError`, `when` | `IntegerTypeHandler` |
| `FloatType` | `Yiisoft\Validator\Rule\Type\FloatType` | `string $message = '{Property} must be a float. {type} given.'`, `mixed $skipOnEmpty = null`, `bool $skipOnError = false`, `?Closure $when = null` | `skipOnEmpty`, `skipOnError`, `when` | `FloatTypeHandler` |
| `BooleanType` | `Yiisoft\Validator\Rule\Type\BooleanType` | `string $message = '{Property} must be a boolean. {type} given.'`, `mixed $skipOnEmpty = null`, `bool $skipOnError = false`, `?Closure $when = null` | `skipOnEmpty`, `skipOnError`, `when` | `BooleanTypeHandler` |

#### 4. String & Format Rules
| Rule Class | FQCN | Constructor Parameters & Defaults | Modifiers Supported | Handler Class |
|---|---|---|---|---|
| `Length` | `Yiisoft\Validator\Rule\Length` | `?int $exactly = null`, `?int $min = null`, `?int $max = null`, `string $encoding = 'UTF-8'`, `mixed $skipOnEmpty = null`, `bool $skipOnError = false`, `?Closure $when = null` *(Named arguments `min:`, `max:`, `exactly:` required)* | `skipOnEmpty`, `skipOnError`, `when` | `LengthHandler` |
| `Email` | `Yiisoft\Validator\Rule\Email` | `string $pattern = ...`, `string $fullPattern = ...`, `string $idnEmailPattern = ...`, `bool $allowName = false`, `bool $checkDns = false`, `bool $enableIdn = false`, `string $incorrectInputMessage = ...`, `string $message = ...`, `mixed $skipOnEmpty = null`, `bool $skipOnError = false`, `?Closure $when = null` *(Use named arguments)* | `skipOnEmpty`, `skipOnError`, `when` | `EmailHandler` |
| `Regex` | `Yiisoft\Validator\Rule\Regex` | `string $pattern`, `bool $not = false`, `string $message = '{Property} is invalid.'`, `mixed $skipOnEmpty = null`, `bool $skipOnError = false`, `?Closure $when = null` | `skipOnEmpty`, `skipOnError`, `when` | `RegexHandler` |
| `Url` | `Yiisoft\Validator\Rule\Url` | `string $pattern = ...`, `array $validSchemes = ['http', 'https']`, `bool $enableIdn = false`, `string $incorrectInputMessage = ...`, `string $message = ...`, `mixed $skipOnEmpty = null`, `bool $skipOnError = false`, `?Closure $when = null` *(Use named arguments)* | `skipOnEmpty`, `skipOnError`, `when` | `UrlHandler` |
| `Uuid` | `Yiisoft\Validator\Rule\Uuid` | `string $message = 'The value of {property} is not a valid UUID.'`, `mixed $skipOnEmpty = null`, `bool $skipOnError = false`, `?Closure $when = null` | `skipOnEmpty`, `skipOnError`, `when` | `UuidHandler` |
| `Ip` | `Yiisoft\Validator\Rule\Ip` | `array $networks = []`, `bool $allowIpv4 = true`, `bool $allowIpv6 = true`, `bool $allowSubnet = false`, `bool $requireSubnet = false`, `bool $allowNegation = false`, `mixed $skipOnEmpty = null`, `bool $skipOnError = false`, `?Closure $when = null` | `skipOnEmpty`, `skipOnError`, `when` | `IpHandler` |
| `Json` | `Yiisoft\Validator\Rule\Json` | `string $message = '{Property} is not a valid JSON.'`, `mixed $skipOnEmpty = null`, `bool $skipOnError = false`, `?Closure $when = null` | `skipOnEmpty`, `skipOnError`, `when` | `JsonHandler` |

#### 5. Comparison Rules (Extend `AbstractCompare`)
> [!NOTE]
> In all comparison rules, `$skipOnEmpty` defaults to `false` (unlike other rules where it defaults to `null`). Always use named arguments `targetProperty:`, `targetValue:`, `operator:`, `type:`.

| Rule Class | FQCN | Constructor Parameters & Defaults | Modifiers Supported | Handler Class |
|---|---|---|---|---|
| `Compare` | `Yiisoft\Validator\Rule\Compare` | `mixed $targetValue = null`, `?string $targetProperty = null`, `string $incorrectInputMessage = ...`, `string $incorrectDataSetTypeMessage = ...`, `?string $message = null`, `string $type = CompareType::NUMBER`, `string $operator = '=='`, `mixed $skipOnEmpty = null`, `bool $skipOnError = false`, `?Closure $when = null` *(Named arguments required)* | `skipOnEmpty`, `skipOnError`, `when` | `CompareHandler` |
| `Equal` | `Yiisoft\Validator\Rule\Equal` | `mixed $targetValue = null`, `?string $targetProperty = null`, `string $type = CompareType::NUMBER`, `bool $strict = false`, `mixed $skipOnEmpty = false`, `bool $skipOnError = false`, `?Closure $when = null` | `skipOnEmpty: false`, `skipOnError`, `when` | `CompareHandler` |
| `NotEqual` | `Yiisoft\Validator\Rule\NotEqual` | `mixed $targetValue = null`, `?string $targetProperty = null`, `string $type = CompareType::NUMBER`, `bool $strict = false`, `mixed $skipOnEmpty = false`, `bool $skipOnError = false`, `?Closure $when = null` | `skipOnEmpty: false`, `skipOnError`, `when` | `CompareHandler` |
| `GreaterThan` | `Yiisoft\Validator\Rule\GreaterThan` | `mixed $targetValue = null`, `?string $targetProperty = null`, `string $type = CompareType::NUMBER`, `mixed $skipOnEmpty = false`, `bool $skipOnError = false`, `?Closure $when = null` | `skipOnEmpty: false`, `skipOnError`, `when` | `CompareHandler` |
| `GreaterThanOrEqual` | `Yiisoft\Validator\Rule\GreaterThanOrEqual` | `mixed $targetValue = null`, `?string $targetProperty = null`, `string $type = CompareType::NUMBER`, `mixed $skipOnEmpty = false`, `bool $skipOnError = false`, `?Closure $when = null` | `skipOnEmpty: false`, `skipOnError`, `when` | `CompareHandler` |
| `LessThan` | `Yiisoft\Validator\Rule\LessThan` | `mixed $targetValue = null`, `?string $targetProperty = null`, `string $type = CompareType::NUMBER`, `mixed $skipOnEmpty = false`, `bool $skipOnError = false`, `?Closure $when = null` | `skipOnEmpty: false`, `skipOnError`, `when` | `CompareHandler` |
| `LessThanOrEqual` | `Yiisoft\Validator\Rule\LessThanOrEqual` | `mixed $targetValue = null`, `?string $targetProperty = null`, `string $type = CompareType::NUMBER`, `mixed $skipOnEmpty = false`, `bool $skipOnError = false`, `?Closure $when = null` | `skipOnEmpty: false`, `skipOnError`, `when` | `CompareHandler` |

#### 6. Collections & Iteration Rules
| Rule Class | FQCN | Constructor Parameters & Defaults | Modifiers Supported | Handler Class |
|---|---|---|---|---|
| `Count` | `Yiisoft\Validator\Rule\Count` | `?int $exactly = null`, `?int $min = null`, `?int $max = null`, `string $incorrectInputMessage = ...`, `string $lessThanMinMessage = ...`, `string $greaterThanMaxMessage = ...`, `string $notExactlyMessage = ...`, `mixed $skipOnEmpty = null`, `bool $skipOnError = false`, `?Closure $when = null` *(Named arguments `min:`, `max:`, `exactly:` required)* | `skipOnEmpty`, `skipOnError`, `when` | `CountHandler` |
| `Each` | `Yiisoft\Validator\Rule\Each` | `callable\|iterable\|object\|string $rules = []`, `string $incorrectInputMessage = ...`, `string $incorrectInputKeyMessage = ...`, `mixed $skipOnEmpty = null`, `bool $skipOnError = false`, `?Closure $when = null`, `bool $stopOnError = false` *(Note: `$stopOnError` is parameter #7; use named `stopOnError: true`)* | `skipOnEmpty`, `skipOnError`, `when` | `EachHandler` |
| `In` | `Yiisoft\Validator\Rule\In` | `iterable $values`, `bool $strict = false`, `bool $not = false`, `mixed $skipOnEmpty = null`, `bool $skipOnError = false`, `?Closure $when = null` | `skipOnEmpty`, `skipOnError`, `when` | `InHandler` |
| `InEnum` | `Yiisoft\Validator\Rule\InEnum` | `class-string<UnitEnum> $class`, `bool $useNames = false`, `bool $strict = false`, `bool $not = false`, `mixed $skipOnEmpty = null`, `bool $skipOnError = false`, `?Closure $when = null` | `skipOnEmpty`, `skipOnError`, `when` | `InEnumHandler` |
| `Subset` | `Yiisoft\Validator\Rule\Subset` | `iterable $values`, `bool $strict = false`, `mixed $skipOnEmpty = null`, `bool $skipOnError = false`, `?Closure $when = null` | `skipOnEmpty`, `skipOnError`, `when` | `SubsetHandler` |
| `UniqueIterable` | `Yiisoft\Validator\Rule\UniqueIterable` | `string $message = 'Every iterable\'s item of {property} must be unique.'`, `mixed $skipOnEmpty = null`, `bool $skipOnError = false`, `?Closure $when = null` | `skipOnEmpty`, `skipOnError`, `when` | `UniqueIterableHandler` |

#### 7. Structural & Flow Combinator Rules
| Rule Class | FQCN | Constructor Parameters & Defaults | Modifiers Supported | Handler Class |
|---|---|---|---|---|
| `Nested` | `Yiisoft\Validator\Rule\Nested` | `iterable\|object\|string\|null $rules = null`, `int $validatedObjectPropertyVisibility = ...`, `int $rulesSourceClassPropertyVisibility = ...`, `string $noRulesWithNoObjectMessage = ...`, `string $incorrectDataSetTypeMessage = ...`, `string $incorrectInputMessage = ...`, `bool $requirePropertyPath = false`, `string $noPropertyPathMessage = ...`, `bool $handleEachShortcut = true`, `bool $propagateOptions = false`, `mixed $skipOnEmpty = null`, `bool $skipOnError = false`, `?Closure $when = null` *(Named arguments required)* | `skipOnEmpty`, `skipOnError`, `when` | `NestedHandler` |
| `Composite` | `Yiisoft\Validator\Rule\Composite` | `iterable $rules = []`, `mixed $skipOnEmpty = null`, `bool $skipOnError = false`, `?Closure $when = null` | `skipOnEmpty`, `skipOnError`, `when` | `CompositeHandler` |
| `StopOnError` | `Yiisoft\Validator\Rule\StopOnError` | `iterable $rules = []`, `mixed $skipOnEmpty = null`, `bool $skipOnError = false`, `?Closure $when = null` | `skipOnEmpty`, `skipOnError`, `when` | `StopOnErrorHandler` |
| `AnyRule` | `Yiisoft\Validator\Rule\AnyRule` | `iterable $rules = []`, `string $message = 'At least one of the inner rules must pass the validation.'`, `mixed $skipOnEmpty = null`, `bool $skipOnError = false`, `?Closure $when = null` | `skipOnEmpty`, `skipOnError`, `when` | `AnyRuleHandler` |

#### 8. Cross-Property Cardinality Rules
| Rule Class | FQCN | Constructor Parameters & Defaults | Modifiers Supported | Handler Class |
|---|---|---|---|---|
| `FilledAtLeast` | `Yiisoft\Validator\Rule\FilledAtLeast` | `array $properties`, `int $min = 1`, `string $message = 'At least {min, number} {min, plural, one{property} other{properties}} from this list must be filled: {properties}.'`, `mixed $skipOnEmpty = null`, `bool $skipOnError = false`, `?Closure $when = null` | `skipOnEmpty`, `skipOnError`, `when` | `FilledAtLeastHandler` |
| `FilledOnlyOneOf` | `Yiisoft\Validator\Rule\FilledOnlyOneOf` | `array $properties`, `string $message = 'Exactly 1 property from this list must be filled: {properties}.'`, `mixed $skipOnEmpty = null`, `bool $skipOnError = false`, `?Closure $when = null` | `skipOnEmpty`, `skipOnError`, `when` | `FilledOnlyOneOfHandler` |

#### 9. Date Rules (`Rule\Date\*`)
| Rule Class | FQCN | Constructor Parameters & Defaults | Modifiers Supported | Handler Class |
|---|---|---|---|---|
| `Date` | `Yiisoft\Validator\Rule\Date\Date` | `?string $format = null`, `?int $dateType = null`, `?string $timeZone = null`, `?string $locale = null`, `mixed $min = null`, `mixed $max = null`, `mixed $skipOnEmpty = null`, `bool $skipOnError = false`, `?Closure $when = null` | `skipOnEmpty`, `skipOnError`, `when` | `Date\DateHandler` |
| `DateTime` | `Yiisoft\Validator\Rule\Date\DateTime` | `?string $format = null`, `?int $dateType = null`, `?int $timeType = null`, `?string $timeZone = null`, `?string $locale = null`, `mixed $min = null`, `mixed $max = null`, `mixed $skipOnEmpty = null`, `bool $skipOnError = false`, `?Closure $when = null` | `skipOnEmpty`, `skipOnError`, `when` | `Date\DateTimeHandler` |
| `Time` | `Yiisoft\Validator\Rule\Date\Time` | `?string $format = null`, `?int $timeType = null`, `?string $timeZone = null`, `?string $locale = null`, `mixed $min = null`, `mixed $max = null`, `mixed $skipOnEmpty = null`, `bool $skipOnError = false`, `?Closure $when = null` | `skipOnEmpty`, `skipOnError`, `when` | `Date\TimeHandler` |

#### 10. File & Image Rules
| Rule Class | FQCN | Constructor Parameters & Defaults | Modifiers Supported | Handler Class |
|---|---|---|---|---|
| `File` | `Yiisoft\Validator\Rule\File` | `array\|string\|null $extensions = null`, `array\|string\|null $mimeTypes = null`, `?int $size = null`, `?int $minSize = null`, `?int $maxSize = null`, `bool $trustClientMediaType = false`, `mixed $skipOnEmpty = null`, `bool $skipOnError = false`, `?Closure $when = null` | `skipOnEmpty`, `skipOnError`, `when` | `FileHandler` |
| `Image` | `Yiisoft\Validator\Rule\Image\Image` | `?int $width = null`, `?int $height = null`, `?int $minWidth = null`, `?int $minHeight = null`, `?int $maxWidth = null`, `?int $maxHeight = null`, `?ImageAspectRatio $aspectRatio = null`, `string $notImageMessage = ...` *(8 dimension messages follow)*, `mixed $skipOnEmpty = null`, `bool $skipOnError = false`, `?Closure $when = null` *(Named arguments required)* | `skipOnEmpty`, `skipOnError`, `when` | `Image\ImageHandler` |
| `ImageAspectRatio` | `Yiisoft\Validator\Rule\Image\ImageAspectRatio` | `int $width`, `int $height`, `float $margin = 0` | Value object companion | Evaluated by `ImageHandler` |

> [!TIP]
> **`File` Rule Deep-Dive:**
> For the complete `File` constructor (including all message parameters), size/exclusivity and upload-error traps, the `trustClientMediaType` warning, and string-keyed validation-call semantics, see [§5.1](#51-file-rule--safe-post-validation-storage).

#### 11. Miscellaneous Rules
| Rule Class | FQCN | Constructor Parameters & Defaults | Modifiers Supported | Handler Class |
|---|---|---|---|---|
| `Callback` | `Yiisoft\Validator\Rule\Callback` | `mixed $callback = null`, `?string $method = null`, `mixed $skipOnEmpty = null`, `bool $skipOnError = false`, `?Closure $when = null` | `skipOnEmpty`, `skipOnError`, `when` | `CallbackHandler` |

---

### 2.4. Lenient HTTP Input Rules vs. Strict Domain Type Rules

Pick rules intentionally based on the architectural layer:

1. **HTTP Input Boundary (Lenient Rules):**
   - Rules: `StringValue`, `Integer`, `Number`, `BooleanValue`.
   - Behavior: Accepts scalar representations. For example, string `"42"` passes `Integer(min: 1, max: 100)`; string `"1"` passes `BooleanValue()`.
   - Usage: Apply to form models and raw request DTOs where data arrives encoded as HTTP strings or query parameters.

2. **Domain Invariants Layer (Strict Rules):**
   - Rules: `Yiisoft\Validator\Rule\Type\StringType`, `IntegerType`, `FloatType`, `BooleanType`.
   - Behavior: Enforces native PHP types via `is_string()`, `is_int()`, `is_float()`, `is_bool()`. Passing `"42"` to `IntegerType` immediately fails with `"{Property} must be an integer. string given."`.
   - Usage: Apply to internal service DTOs, domain command handlers, or database entity invariants to guard against subtle type coercion bugs.

---

## 3. Declaring Rules & Validation Flow Modifiers

### 3.1. Repeatable PHP Attributes

Stacking attributes on a typed DTO property declares a rule chain. Rules run sequentially in the order declared:

```php
declare(strict_types=1);

namespace App\Application\Post\Dto;

use Yiisoft\Validator\Label;
use Yiisoft\Validator\Rule\Length;
use Yiisoft\Validator\Rule\Required;
use Yiisoft\Validator\Rule\StringValue;

final class CreatePostInput
{
    #[Label('Publication Title')]
    #[Required]
    #[StringValue]
    #[Length(min: 3, max: 255)]
    public string $title = '';
}
```

The validator automatically extracts attributes via `Yiisoft\Validator\RulesProvider\AttributesRulesProvider`.

> [!WARNING]
> Always place `#[Required]` **first** in the attribute stack. By default, package rules do **not** skip empty values: their `skipOnEmpty` option defaults to `null`, which resolves to `EmptyCondition\NeverEmpty` (`vendor/yiisoft/validator`, `Helper/SkipOnEmptyNormalizer.php`). An empty input (`""`, `null`) therefore still fails the subsequent rules with their own messages (e.g. `Length` reports a length error instead of a required-value error). `#[Required]` first guarantees the proper required-value error for empty input. To make a property truly optional, pass `skipOnEmpty: true` on each rule (or configure the validator with `defaultSkipOnEmpty`) — see the option table in §3.3.

### 3.2. Ad-Hoc Rules, Class Strings & RulesProviderInterface

`ValidatorInterface::validate($data, $rules)` accepts four distinct rule sources normalized by `Yiisoft\Validator\Helper\RulesNormalizer`:

```php
declare(strict_types=1);

namespace App\Application\Post;

use App\Application\Post\Dto\CreatePostInput;
use Yiisoft\Validator\Result;
use Yiisoft\Validator\Rule\Each;
use Yiisoft\Validator\Rule\Length;
use Yiisoft\Validator\Rule\Required;
use Yiisoft\Validator\Rule\StringValue;
use Yiisoft\Validator\ValidatorInterface;

final readonly class PostValidationService
{
    public function __construct(
        private ValidatorInterface $validator,
    ) {}

    public function validateRawData(array $payload): Result
    {
        // 1. Explicit mapping: property name => array of rules
        return $this->validator->validate($payload, [
            'title' => [new Required(), new Length(min: 3, max: 255)],
            'tags'  => [new Each([new StringValue(), new Length(max: 50)])],
        ]);
    }

    public function validateByClassString(array $payload): Result
    {
        // 2. Class string: validator extracts attributes from CreatePostInput without instantiating it
        return $this->validator->validate($payload, CreatePostInput::class);
    }
}
```

- **Dynamic Rules (`RulesProviderInterface`):** When `$data` implements `Yiisoft\Validator\RulesProviderInterface`, its `getRules(): iterable` method supplies rules dynamically (e.g. conditional fields based on database settings).
- **Callable Wrapping:** A bare closure passed to `validate()` is automatically wrapped into a `Callback` rule.

### 3.3. Execution Modifiers: skipOnEmpty, skipOnError, when

All rules (with the noted exception of `Required` regarding `skipOnEmpty`) support three execution modifiers implemented via `Yiisoft\Validator\Rule\Trait\*`:

#### 1. `skipOnEmpty: bool|callable|null`
Controls whether empty values bypass the rule:
- `null` (default): falls back to the validator's `defaultSkipOnEmpty`; the out-of-the-box default is `NeverEmpty`, i.e. rules run on empty values.
- `false`: the rule runs even if the value is empty.
- `true`: skips validation if the value is `null`, empty string `""`, or an empty array.
- `callable`: a custom empty condition. Yii 3 ships four built-in condition classes in `Yiisoft\Validator\EmptyCondition\*`:
  - `WhenEmpty`: default check (`null`, `""`, or `[]`).
  - `WhenNull`: skips only when the value is strictly `null`.
  - `NeverEmpty`: never skips.
  - `WhenMissing`: skips only if the key was completely omitted from the dataset.

> [!TIP]
> **PATCH Endpoints & `WhenMissing`:**
> Use `#[Required(emptyCondition: new WhenMissing())]` for partial HTTP PATCH requests. This allows clients to update a field to `""` or `null` while ensuring an error is raised only if the key is missing from the payload.

#### 2. `skipOnError: bool`
When set to `true`, the rule is skipped if a preceding rule on the same property has already failed. This prevents error cascading (e.g. preventing `Regex` or `Email` from executing after `Length` has already rejected the string).

#### 3. `when: ?Closure`
A conditional execution closure with signature:
```php
fn (mixed $value, ValidationContext $context): bool
```
The rule executes only if the closure returns `true`.

```php
declare(strict_types=1);

namespace App\Application\Order\Dto;

use Yiisoft\Validator\Rule\Required;
use Yiisoft\Validator\Rule\Url;
use Yiisoft\Validator\ValidationContext;

final class DeliveryOptionsDto
{
    public bool $isPickup = false;

    // Required only when pickup is disabled
    #[Required(when: static fn (mixed $value, ValidationContext $context): bool => self::isShippingRequired($value, $context))]
    public ?string $shippingAddress = null;

    public static function isShippingRequired(mixed $value, ValidationContext $context): bool
    {
        return $context->getDataSet()->getPropertyValue('isPickup') === false;
    }
}
```

### 3.4. Flow Control Combinators: StopOnError, AnyRule, Composite

Combinator rules control execution flow across grouped rules:

- **`StopOnError([...])` (Circuit Breaker):** Halts evaluation of subsequent rules in the group as soon as the first rule produces an error:
  ```php
  #[StopOnError([
      new Required(),
      new Integer(min: 1),
      new Callback([self::class, 'checkRemoteInventory']),
  ])]
  public ?int $productId = null;
  ```
- **`AnyRule([...], message: ...)` (Logical OR):** Succeeds if at least one rule in the collection passes. If all fail, returns a composite error:
  ```php
  #[AnyRule([
      new Regex(pattern: '/^\+?[1-9]\d{1,14}$/'), // E.164 phone format
      new Email(),
  ], message: '{Property} must be a valid telephone number or email address.')]
  public string $contactIdentifier = '';
  ```
- **`Composite([...], skipOnEmpty: ..., when: ...)`:** Bundles multiple rules so they can share common `skipOnEmpty`, `skipOnError`, or `when` modifiers.

---

## 4. Custom Rules & Rule Handlers

In Yii 3, custom validation rules follow a decoupled architecture separating configuration (`RuleInterface`, PHP 8 `#[Attribute]`) from execution services (`RuleHandlerInterface`), and require explicit DI configuration via `RuleHandlerContainer`.

For complete recipes, interface implementation details (`DumpedRuleInterface`, `SkipOnEmptyInterface`, `WhenInterface`), cross-property validation via `ValidationContext`, compound composite rules (`Rule\Composite`), one-off checks with `Rule\Callback`, and isolated unit and integration testing suites, see the dedicated reference guide:

&rarr; **[Custom Validation Rules & Testing Guide](http-validation-custom-rules.md)**

---

## 5. File & Image Validation

### 5.1. File Rule & Safe Post-Validation Storage

The file validation rule resides in the root rule namespace: `Yiisoft\Validator\Rule\File` (`vendor/yiisoft/validator/src/Rule/File.php`).

`File` validates:
- Local filesystem paths (`string`).
- Standard PHP `SplFileInfo` objects.
- PSR-7 `Psr\Http\Message\UploadedFileInterface` instances.

```php
declare(strict_types=1);

namespace App\Application\Document\Dto;

use Psr\Http\Message\UploadedFileInterface;
use Yiisoft\Validator\Label;
use Yiisoft\Validator\Rule\File;
use Yiisoft\Validator\Rule\Required;

final class UploadDocumentInput
{
    #[Label('Contract PDF')]
    #[Required]
    #[File(
        extensions: ['pdf'],
        mimeTypes: ['application/pdf'],
        minSize: 10 * 1024,           // 10 KB
        maxSize: 15 * 1024 * 1024,     // 15 MB
        message: 'Please provide a valid file.',
        tooBigMessage: 'The file {property} cannot exceed 15 MB.',
    )]
    public ?UploadedFileInterface $document = null;
}
```

**Complete constructor** (verbatim, `vendor/yiisoft/validator/src/Rule/File.php` — the §2.3 catalog row above lists the core options; the message parameters complete the signature):

```php
public function __construct(
    array|string|null $extensions = null,
    array|string|null $mimeTypes = null,
    ?int $size = null,
    ?int $minSize = null,
    ?int $maxSize = null,
    bool $trustClientMediaType = false,
    string $message = '{Property} must be a file.',
    string $uploadFailedMessage = 'Failed to upload {property}. Error code: {error, number}.',
    string $uploadRequiredMessage = 'Please upload a file.',
    string $wrongExtensionMessage = 'Only files with these extensions are allowed: {extensions}.',
    string $wrongMimeTypeMessage = 'Only files with these MIME types are allowed: {mimeTypes}.',
    string $notExactSizeMessage = 'The size of {property} must be exactly {exactly, number} {exactly, plural, one{byte} other{bytes}}.',
    string $tooSmallMessage = 'The size of {property} cannot be smaller than {limit, number} {limit, plural, one{byte} other{bytes}}.',
    string $tooBigMessage = 'The size of {property} cannot be larger than {limit, number} {limit, plural, one{byte} other{bytes}}.',
    string $unableToDetermineSizeMessage = 'The size of {property} cannot be determined.',
    bool|callable|null $skipOnEmpty = null,
    bool $skipOnError = false,
    ?Closure $when = null,
)
```

- Exact `size` is mutually exclusive with `minSize` / `maxSize` (`InvalidArgumentException`); negative sizes and `minSize > maxSize` are rejected.
- Upload error pipeline: `UPLOAD_ERR_NO_FILE` → `uploadRequiredMessage`; any other non-OK error → `uploadFailedMessage`, with `{error}` carrying the numeric PHP upload error code.
- Optional uploads: `new File(skipOnEmpty: true)` treats `UPLOAD_ERR_NO_FILE` as "empty".
- `extensions` / `mimeTypes` accept `array|string` (string = comma/space separated), support MIME wildcards like `image/*`, and are lowercased/deduplicated. A file **without an extension fails** when `extensions` is configured.

> [!WARNING]
> `trustClientMediaType` defaults to `false`. For a pathless / in-memory `UploadedFileInterface` there is no
> real file on disk to sniff: the client media type is used only when `trustClientMediaType` is enabled,
> otherwise MIME validation fails. Client MIME is spoofable — enable it only deliberately.

> [!NOTE]
> The `File` rule also accepts string paths and `SplFileInfo` — that does not prove HTTP-upload provenance.
> Never pass user-submitted paths into it.

**Validation-call semantics** — string keys in the rules map address **properties of the validated data**:

```php
// Whole-value validation (rules in a flat list):
$result = $this->validator->validate($uploaded, [new Required(), new File(extensions: ['pdf'])]);

// Named field — the key must exist in the data AND in the rules map:
$result = $this->validator->validate(
    ['document' => $uploaded],
    ['document' => [new Required(), new File(extensions: ['pdf'])]],
);
```

> [!IMPORTANT]
> `validate($uploaded, ['document' => [...]])` — a bare upload under a string-keyed rules map — always fails
> `Required`: the validator reads a non-existent `document` property (`null`) from the wrapped upload object.

> [!TIP]
> **Post-Validation File Persistence Reference:**
> After validation, persist the uploaded file with `$uploadedFile->moveTo()`. For directory creation (`FileHelper::ensureDirectory()`), alias resolution, filename generation, and storage-service placement, see the [File Handling Guide, §4](http-file-handling.md#4-file-uploads-psr-7--validator) and [§5](http-file-handling.md#5-placement--wiring).

### 5.2. Image & Aspect Ratio Rules (`Rule\Image\Image`, `ImageAspectRatio`)

Image rules are housed in `Yiisoft\Validator\Rule\Image\*`:
- `Yiisoft\Validator\Rule\Image\Image` checks dimensions (width and height limits in pixels). Requires PHP `ext-gd`.
- `Yiisoft\Validator\Rule\Image\ImageAspectRatio` is a companion value object validating aspect ratios with an allowed tolerance margin.

```php
declare(strict_types=1);

namespace App\Application\Profile\Dto;

use Psr\Http\Message\UploadedFileInterface;
use Yiisoft\Validator\Label;
use Yiisoft\Validator\Rule\File;
use Yiisoft\Validator\Rule\Image\Image;
use Yiisoft\Validator\Rule\Image\ImageAspectRatio;
use Yiisoft\Validator\Rule\Required;

final class UpdateAvatarInput
{
    #[Label('Profile Picture')]
    #[Required]
    #[File(
        extensions: ['jpg', 'jpeg', 'png', 'webp'],
        mimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
        maxSize: 2 * 1024 * 1024,
    )]
    #[Image(
        minWidth: 200,
        minHeight: 200,
        maxWidth: 2000,
        maxHeight: 2000,
        aspectRatio: new ImageAspectRatio(width: 1, height: 1, margin: 5.0), // 1:1 ±5% margin
    )]
    public ?UploadedFileInterface $avatar = null;
}
```

Constructor options and behavioral traps (from `vendor/yiisoft/validator/src/Rule/Image/Image.php`):

- Constructor parameters: `?int $width`, `?int $height`, `?int $minWidth`, `?int $minHeight`, `?int $maxWidth`, `?int $maxHeight`, `?ImageAspectRatio $aspectRatio`, message parameters, then `skipOnEmpty` / `skipOnError` / `when`. Exact `width` / `height` are mutually exclusive with their min/max counterparts (`InvalidArgumentException`).
- A bare `new Image()` is an "is an image" check only — dimensions are validated when a constraint is set.
- For `UploadedFileInterface` the handler requires `getError() === UPLOAD_ERR_OK` and reads the temp path from the stream metadata.
- Dimension checks rely on `getimagesize()` — HEIF/HEIC images are not supported.

### 5.3. Validating PSR-7 UploadedFileInterface & Multi-File Collections

When receiving an array of uploaded files, wrap `File` or `Image` inside `Each`:

```php
declare(strict_types=1);

namespace App\Application\Gallery\Dto;

use Psr\Http\Message\UploadedFileInterface;
use Yiisoft\Input\Http\Attribute\Parameter\UploadedFiles;
use Yiisoft\Validator\Rule\Count;
use Yiisoft\Validator\Rule\Each;
use Yiisoft\Validator\Rule\File;
use Yiisoft\Validator\Rule\Image\Image;
use Yiisoft\Validator\Rule\Required;

final class UploadGalleryInput
{
    /**
     * @var array<UploadedFileInterface>
     */
    #[UploadedFiles('gallery_images')]
    #[Required]
    #[Count(min: 1, max: 10)]
    #[Each([
        new File(extensions: ['jpg', 'png'], maxSize: 5 * 1024 * 1024),
        new Image(minWidth: 800, minHeight: 600),
    ])]
    public array $images = [];
}
```

---

## 6. Cross-Property Validation & Contextual Comparison

### 6.1. Comparison Rules: targetProperty vs. targetValue

All comparison rules (`Equal`, `NotEqual`, `GreaterThan`, `GreaterThanOrEqual`, `LessThan`, `LessThanOrEqual`, `Compare`) inherit from `Yiisoft\Validator\Rule\AbstractCompare`.

- To compare against a static scalar: use `targetValue: 100`.
- To compare against a sibling property in the dataset: use `targetProperty: 'otherPropertyName'`.

> [!WARNING]
> In Yii 3, the target field parameter is named **`targetProperty`**. Using `targetAttribute`, `target`, or `property` causes an `Error: Unknown named parameter` in PHP 8.

```php
declare(strict_types=1);

namespace App\Application\Auth\Dto;

use Yiisoft\Validator\Label;
use Yiisoft\Validator\Rule\Equal;
use Yiisoft\Validator\Rule\Length;
use Yiisoft\Validator\Rule\Required;

final class RegisterInput
{
    #[Label('Password')]
    #[Required]
    #[Length(min: 8)]
    public string $password = '';

    #[Label('Password Confirmation')]
    #[Required]
    #[Equal(
        targetProperty: 'password',
        message: '{Property} must match {targetProperty}.',
    )]
    public string $passwordRepeat = '';
}
```

Available message placeholders in comparison rules:
- `{property}` / `{Property}` — validated property name.
- `{targetProperty}` / `{TargetProperty}` — target property name.
- `{targetValue}` — static target value.
- `{targetPropertyValue}` — resolved value of the target property.
- `{targetValueOrProperty}` — resolved property value or static target value.

### 6.2. Cross-Property Cardinality: FilledAtLeast, FilledOnlyOneOf

Use cross-property cardinality rules when multiple properties must be validated in relation to each other:

```php
declare(strict_types=1);

namespace App\Application\Notification\Dto;

use Yiisoft\Validator\Rule\Email;
use Yiisoft\Validator\Rule\FilledAtLeast;
use Yiisoft\Validator\Rule\FilledOnlyOneOf;
use Yiisoft\Validator\Rule\Regex;

#[FilledAtLeast(
    properties: ['mobilePhone', 'emailAddress'],
    min: 1,
    message: 'At least one contact method must be provided.',
)]
#[FilledOnlyOneOf(
    properties: ['discountPercentage', 'fixedDiscountAmount'],
    message: 'Specify either a percentage discount or a fixed discount, not both.',
)]
final class CustomerPreferencesInput
{
    #[Regex(pattern: '/^\+?[1-9]\d{1,14}$/')]
    public ?string $mobilePhone = null;

    #[Email]
    public ?string $emailAddress = null;

    public ?int $discountPercentage = null;
    public ?float $fixedDiscountAmount = null;
}
```

### 6.3. Dynamic Context Inspection via ValidationContext

Within custom rules or callbacks, inspect the enclosing dataset via `$context->getDataSet()`:

```php
$dataset = $context->getDataSet();
$userRole = $dataset->getPropertyValue('role');
$accountType = $dataset->getPropertyValue('accountType');
```

---

## 7. Messages, Labels, Placeholders & Internationalization

### 7.1. Translation Category 'yii-validator' & TranslatorMessagePhp Requirement

All built-in error messages in `yiisoft/validator` are translated using `Yiisoft\Translator\TranslatorInterface` under the default category **`'yii-validator'`** (`Yiisoft\Validator\Validator::DEFAULT_TRANSLATION_CATEGORY`).

The package ships official translations in `vendor/yiisoft/validator/messages/<locale>/yii-validator.php` (e.g. Russian, German, French, Spanish, Ukrainian).

> [!IMPORTANT]
> **Mandatory Dependency: `yiisoft/translator-message-php`**
> In `vendor/yiisoft/validator/config/di.php`, the category source definition checks:
> ```php
> $reader = class_exists(MessageSource::class)
>     ? new MessageSource(\dirname(__DIR__) . '/messages')
>     : new IdMessageReader();
> ```
> If `yiisoft/translator-message-php` is missing from `composer.json`, `class_exists(MessageSource::class)` returns `false`. The validator falls back to `IdMessageReader`, leaving all system error messages untranslated even if the application locale is configured. Always install:
> ```bash
> composer require yiisoft/translator-message-php
> ```

Application DI configuration (`config/common/di/validator.php`):
```php
declare(strict_types=1);

use Yiisoft\Validator\Validator;
use Yiisoft\Validator\ValidatorInterface;

return [
    ValidatorInterface::class => [
        'class' => Validator::class,
        '__construct()' => [
            'translationCategory' => 'yii-validator',
        ],
    ],
];
```

### 7.2. Placeholder Substitution: {Property}, {value}, and Parameter Tokens

Placeholders use curly braces and match parameter arrays passed to `$result->addError()`:
- `{Property}` — capitalized translated property name (e.g. `"Publication Title"`).
- `{property}` — lowercase translated property name (e.g. `"publication title"`).
- `{value}` — scalar value that failed validation.
- Numerical limits: `{min}`, `{max}`, `{exactly}`, `{limit}`.

### 7.3. Property Labels via #[Label] and Property Translators

Property names in error messages default to camelCase property identifiers. To supply human-readable labels, decorate properties with `#[\Yiisoft\Validator\Label('...')]`:

```php
declare(strict_types=1);

namespace App\Application\Article\Dto;

use Yiisoft\Validator\Label;
use Yiisoft\Validator\Rule\Length;
use Yiisoft\Validator\Rule\Required;

final class ArticleInput
{
    #[Label('Article Headline')]
    #[Required]
    #[Length(min: 5, max: 200)]
    public string $headline = '';
}
```

> [!IMPORTANT]
> The `#[Label]` attribute belongs to **`Yiisoft\Validator\Label`**, NOT `yiisoft/form-model`.

#### Property Translators
Dynamic label resolution can also be customized via `PropertyTranslatorInterface`:
- `Yiisoft\Validator\PropertyTranslator\NullPropertyTranslator` — returns the raw property name untouched.
- `Yiisoft\Validator\PropertyTranslator\ArrayPropertyTranslator` — translates using a static map: `new ArrayPropertyTranslator(['title' => 'Article Title'])`.
- `Yiisoft\Validator\PropertyTranslator\TranslatorPropertyTranslator` — delegates property name translation to `Yiisoft\Translator\TranslatorInterface`.

*(Note: There is no `SimplePropertyTranslator` in Yii 3; using it causes a fatal class not found error).*

### 7.4. Message Formatters: SimpleMessageFormatter vs. IntlMessageFormatter

When configuring `yiisoft/translator`:
- **`SimpleMessageFormatter`:** Replaces tokens via string substitution and supports basic binary pluralization (`one` and `other`). It throws `InvalidArgumentException` if any `{param}` token in the template is absent from parameters.
- **`IntlMessageFormatter`:** Uses PHP's `ext-intl` and ICU MessageFormat. It is **mandatory** for languages with complex plural rules (such as Russian, Polish, Czech with `one`, `few`, `many`, `other`). In ICU templates, escape literal curly braces with single quotes: `'{'`.

---

## 8. Form Models & Web Form Lifecycle (`yiisoft/form-model` & `yiisoft/form`)

### 8.1. FormModel Base Class & FormModelInterface Contract

`Yiisoft\FormModel\FormModel` is the abstract base class for HTML forms. It bridges validation, hydration, presentation metadata, and form widgets.

Key methods of `FormModelInterface` (`vendor/yiisoft/form-model/src/FormModelInterface.php`):
- `getFormName(): string` — short class name by default (`"ContactForm"`). Acts as the scope key in POST payloads (`$_POST['ContactForm']['email']`).
- `hasProperty(string $property): bool` — verifies property existence.
- `getPropertyValue(string $property): mixed` — retrieves current value (supports dot paths like `address.city`).
- `getPropertyLabel(string $property): string` — resolves label from `getPropertyLabels()`, `#[Label]`, or inflects the property name using `(new Inflector())->toWords(...)`.
- `getPropertyHint(string $property): string` — retrieves hint from `#[\Yiisoft\FormModel\Attribute\Hint]`.
- `getPropertyPlaceholder(string $property): string` — retrieves placeholder from `#[\Yiisoft\FormModel\Attribute\Placeholder]`.
- `isValid(): bool` / `isValidated(): bool` — queries validation state.
- `getValidationResult(): Result` — returns the accumulated validation result.

> [!CAUTION]
> **`FormModel::addError()` Precondition Trap:**
> `FormModel::addError(string $message, array $valuePath = []): static` calls `$this->getValidationResult()->addErrorWithoutPostProcessing(...)`.
> If called **before** the model has been validated, `getValidationResult()` throws:
> `LogicException: Validation result is not set.`
> Only call `addError()` after `populate*AndValidate()` has executed, or when `isValidated()` is `true`.

### 8.2. FormHydrator: Population, GET/POST Scoping, and Mass-Assignment Protection

`Yiisoft\FormModel\FormHydrator` populates form models from HTTP requests and coordinates validation.

Method signatures (`vendor/yiisoft/form-model/src/FormHydrator.php`):
```php
public function populate(FormModelInterface $model, mixed $data, ?array $map = null, ?bool $strict = null, ?string $scope = null): bool;
public function validate(FormModelInterface $model): Result;
public function populateAndValidate(FormModelInterface $model, mixed $data, ?array $map = null, ?bool $strict = null, ?string $scope = null): bool;

// POST Form Submissions:
public function populateFromPost(FormModelInterface $model, ServerRequestInterface $request, ?array $map = null, ?bool $strict = null, ?string $scope = null): bool;
public function populateFromPostAndValidate(FormModelInterface $model, ServerRequestInterface $request, ?array $map = null, ?bool $strict = null, ?string $scope = null): bool;

// GET Search & Filter Submissions:
public function populateFromGet(FormModelInterface $model, ServerRequestInterface $request, ?array $map = null, ?bool $strict = null, ?string $scope = null): bool;
public function populateFromGetAndValidate(FormModelInterface $model, ServerRequestInterface $request, ?array $map = null, ?bool $strict = null, ?string $scope = null): bool;
```

#### Tail Arguments Semantics & Query Scoping
- **`$scope`:** The array key in `$data` to read from.
  - Defaults to `$model->getFormName()` (e.g. `$_POST['ContactForm']['email']` or `$_GET['PostFilter']['status']`).
  - **Flat URL Queries:** For search/filter forms where query parameters sit directly at the root of the URL (`?status=active&search=php`), you **must** pass `$scope: ''`.
- **`$strict` (Mass-Assignment Protection):**
  - `null` (default): **Hydrates only properties that carry validation rules or the `#[Safe]` attribute.** Any extraneous keys sent by the client are silently discarded.
  - `false`: Hydrates all properties present in `$data`.
  - `true`: Hydrates only properties explicitly listed in `$map`.
- **`#[\Yiisoft\FormModel\Attribute\Safe]`:** Marks a property fillable without validation rules under default `$strict = null` mode.

#### FormHydrator TypeCaster Chain
In `yiisoft/form-model/config/di.php`, `FormHydrator` is configured with a specialized type caster chain:
1. `Yiisoft\Hydrator\TypeCaster\NullTypeCaster(emptyString: true)` — converts `""` to `null` for nullable properties (`?string`, `?int`).
2. `Yiisoft\Hydrator\TypeCaster\PhpNativeTypeCaster` — casts scalar PHP types.
3. `Yiisoft\FormModel\NonArrayTypeCaster` — **Form-specific typecaster:** if a property is typed `array` but the submitted value is empty or not an array (e.g. unselected checkbox lists), it casts the input to `[]` to prevent fatal `TypeError`s during hydration. *(Note: belongs to `yiisoft/form-model`, NOT `hydrator`).*
4. `Yiisoft\Hydrator\TypeCaster\HydratorTypeCaster` — recursively hydrates nested DTOs.

#### Recipe: Handling GET Filter Forms with Flat URL Parameters

```php
declare(strict_types=1);

namespace App\Presentation\Web\Post;

use App\Application\Post\PostRepositoryInterface;
use App\Presentation\Web\Post\Form\PostFilterForm;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Yiisoft\FormModel\FormHydrator;
use Yiisoft\Yii\View\Renderer\WebViewRenderer;

final readonly class PostIndexAction
{
    public function __construct(
        private WebViewRenderer $viewRenderer,
        private FormHydrator $formHydrator,
        private PostRepositoryInterface $postRepository,
    ) {}

    public function __invoke(ServerRequestInterface $request): ResponseInterface
    {
        $filterForm = new PostFilterForm();

        // Pass scope: '' because GET parameters are flat in the query string (?search=yii&status=published)
        if ($request->getMethod() === 'GET') {
            $this->formHydrator->populateFromGetAndValidate($filterForm, $request, scope: '');
        }

        $posts = $this->postRepository->findFiltered(
            search: $filterForm->search,
            status: $filterForm->status,
        );

        return $this->viewRenderer->render('post/index', [
            'filterForm' => $filterForm,
            'posts' => $posts,
        ]);
    }
}
```

---

### 8.3. Web Form Architecture & Presentation Boundaries

#### 1. Form Model Definition
```php
declare(strict_types=1);

namespace App\Presentation\Web\Contact\Form;

use Yiisoft\FormModel\Attribute\Hint;
use Yiisoft\FormModel\Attribute\Safe;
use Yiisoft\FormModel\FormModel;
use Yiisoft\Validator\Label;
use Yiisoft\Validator\Rule\Email;
use Yiisoft\Validator\Rule\Length;
use Yiisoft\Validator\Rule\Required;

final class ContactForm extends FormModel
{
    #[Label('Your Name')]
    #[Required]
    #[Length(min: 2, max: 100)]
    public string $name = '';

    #[Label('Email Address')]
    #[Required]
    #[Email]
    public string $email = '';

    #[Label('Message')]
    #[Hint('Please describe your inquiry in detail.')]
    #[Required]
    #[Length(min: 10, max: 2000)]
    public string $message = '';

    #[Safe]
    public ?string $referrer = null;
}
```

#### 2. Web Form Architecture & Presentation Boundaries

In Yii 3, `FormModel` strictly defines the **data structure and validation constraints**, while execution and rendering belong to their respective layers:
- **Action Controller & PRG Flow:** Handling POST submission, flash messages, and `UrlGeneratorInterface` redirects is owned by the [Actions & Controllers Guide, §3.5](http-actions-and-controllers.md#35-html-web-views--form-models-yiisoftyii-view-renderer-yiisoftform-model).
- **View Template & Widget Rendering:** Opening forms with CSRF (`Html::form()->post()->csrf($csrf)->open()`), field widget binding (`Field::text($form, 'name')`), and Bootstrap 5/Bulma theming are owned by the [Views & Widgets Guide, §8](http-views-and-widgets.md#8-html-form-rendering-yiisofthtml-yiisoftform-model-yiisoftform).

---

### 8.4. Validation Rules HTML5 Enrichment (ValidationRulesEnricher)

When rendering HTML form fields via `Yiisoft\FormModel\Field::*`, `Yiisoft\FormModel\ValidationRulesEnricher` automatically inspects `yiisoft/validator` attributes on the model property and generates standard HTML5 client-side attributes:
- `#[Required]` &rarr; `required`
- `#[Length(min: 3, max: 20)]` &rarr; `minlength="3"` and `maxlength="20"`
- `#[Integer(min: 1, max: 100)]` &rarr; `min="1"` and `max="100"`
- `#[Regex(pattern: '/^[A-Z]+$/')]` &rarr; `pattern="^[A-Z]+$"`
- Rules with active `when:` conditions are excluded from client-side enrichment to avoid conflicting states.

> [!WARNING]
> **`ValidationRulesEnricher` Does NOT Generate `accept`:**
> For `Field::file()`, `ValidationRulesEnricher` only converts `#[Required]` into `required`. It does **not** convert `File(extensions: [...], mimeTypes: [...])` into the HTML5 `accept` attribute. You must chain `->accept()` explicitly on the field widget:
> ```php
> <?= Field::file($form, 'document')->accept('application/pdf,image/png') ?>
> ```

> [!TIP]
> **Field Widgets, Themes & Pure Fields Reference:**
> For the complete factory catalog of form inputs (`Field::text`, `Field::select`, `Field::checkboxList`, `Field::radioList`), theme-aware DI with `FieldFactory`, and model-agnostic forms with `PureField`, see the [Views & Widgets Guide, §8](http-views-and-widgets.md#8-html-form-rendering-yiisofthtml-yiisoftform-model-yiisoftform).

---

## 9. Typed DTO Hydration & ValidatingHydrator (`yiisoft/hydrator`, `yiisoft/hydrator-validator`)

### 9.1. Hydrator Architecture, Built-in EnumTypeCaster & Composite Type Casting

`Yiisoft\Hydrator\HydratorInterface` (`vendor/yiisoft/hydrator/src/HydratorInterface.php`):
```php
declare(strict_types=1);

namespace Yiisoft\Hydrator;

interface HydratorInterface
{
    public function hydrate(object $object, array|DataInterface $data = []): void;
    public function create(string $class, array|DataInterface $data = []): object;
}
```

The hydrator parses constructor arguments and promoted properties, uses reflection to resolve parameter attributes (`#[Data]`, `#[ToDateTime]`), and applies a composite chain of `TypeCasterInterface` implementations.

#### Built-in Enum Support (`EnumTypeCaster`)
`Yiisoft\Hydrator\TypeCaster\EnumTypeCaster` provides built-in hydration support for backed PHP 8.1+ Enums (`BackedEnum` and `UnitEnum`). When a DTO constructor parameter is typed with an Enum, strings or integers from the payload are automatically cast to the corresponding Enum instance without requiring a custom typecaster:

```php
declare(strict_types=1);

namespace App\Domain\Order;

enum OrderStatus: string
{
    case PENDING = 'pending';
    case PROCESSING = 'processing';
    case COMPLETED = 'completed';
}
```

```php
declare(strict_types=1);

namespace App\Application\Order\Dto;

use App\Domain\Order\OrderStatus;
use Yiisoft\Hydrator\Validator\Attribute\Validate;
use Yiisoft\Validator\Rule\InEnum;
use Yiisoft\Validator\Rule\Required;

final class UpdateStatusInput
{
    public function __construct(
        #[Validate(new Required(), new InEnum(OrderStatus::class))]
        public readonly OrderStatus $status, // Automatically cast from 'completed' or 'pending'
    ) {}
}
```

### 9.2. Two-Stage Validation via ValidatingHydrator & #[Validate]

`yiisoft/hydrator-validator` provides `Yiisoft\Hydrator\Validator\ValidatingHydrator`, a decorator implementing `HydratorInterface`.

```
                    Raw Input Array ['quantity' => 'not-an-int']
                                       |
                                       v
         +-----------------------------------------------------------+
         | Phase 1: Pre-Hydration Raw Validation                     |
         | Validates raw values against #[Validate(new Integer())]   |
         +-----------------------------------------------------------+
                        |                             |
               Valid    |                             | Invalid
                        v                             v
+------------------------------------+   +------------------------------------+
| Instantiation & Type Casting       |   | Halt Hydration                     |
| Typed constructor runs safely      |   | Prevents fatal PHP TypeError!      |
| without fatal TypeError exceptions |   | Accumulates error in Result        |
+------------------------------------+   +------------------------------------+
                        |                             |
                        v                             v
+--------------------------------------------------------------------+
| Phase 2: Post-Hydration Object Validation                          |
| Runs object-level attributes and rules via ValidatorInterface      |
| Stores Result on DTO via ValidatedInputInterface                   |
+--------------------------------------------------------------------+
```

- **`#[Validate(RuleInterface ...$rules)]`:** Declares rules on constructor parameters. This executes **before** type casting and instantiation. If a string is sent where an integer is expected, `Validate` catches it gracefully without causing a fatal `TypeError`.
- **`ValidatedInputInterface` & `ValidatedInputTrait`:** Contracts for storing and retrieving the `Result`.

### 9.3. Nested DTOs & Collections (OrderDto & OrderItemDto)

```php
declare(strict_types=1);

namespace App\Application\Order\Dto;

use DateTimeImmutable;
use Yiisoft\Hydrator\Attribute\Parameter\Collection;
use Yiisoft\Hydrator\Attribute\Parameter\Data;
use Yiisoft\Hydrator\Attribute\Parameter\ToDateTime;
use Yiisoft\Hydrator\Attribute\Parameter\Trim;
use Yiisoft\Hydrator\Validator\Attribute\Validate;
use Yiisoft\Hydrator\Validator\ValidatedInputInterface;
use Yiisoft\Hydrator\Validator\ValidatedInputTrait;
use Yiisoft\Validator\Label;
use Yiisoft\Validator\Rule\Count;
use Yiisoft\Validator\Rule\Each;
use Yiisoft\Validator\Rule\Email;
use Yiisoft\Validator\Rule\Integer;
use Yiisoft\Validator\Rule\Length;
use Yiisoft\Validator\Rule\Number;
use Yiisoft\Validator\Rule\Required;

final class OrderItemDto implements ValidatedInputInterface
{
    use ValidatedInputTrait;

    public function __construct(
        #[Validate(new Required(), new Integer(min: 1))]
        #[Data('product_id')]
        public readonly int $productId,

        #[Validate(new Required(), new Integer(min: 1, max: 99))]
        public readonly int $quantity,

        #[Validate(new Required(), new Number(min: 0.01))]
        public readonly float $price,
    ) {}
}

final class CreateOrderInput implements ValidatedInputInterface
{
    use ValidatedInputTrait;

    public function __construct(
        #[Label('Customer Email')]
        #[Validate(new Required(), new Email(), new Length(max: 255))]
        #[Trim]
        #[Data('customer_email')]
        public readonly string $customerEmail,

        #[Validate(new Required())]
        #[ToDateTime(format: 'Y-m-d')]
        #[Data('delivery_date')]
        public readonly DateTimeImmutable $deliveryDate,

        #[Label('Order Items')]
        #[Validate(new Required(), new Count(min: 1, max: 50))]
        #[Collection(className: OrderItemDto::class)]
        #[Data('items')]
        public readonly array $items,
    ) {}
}
```

```php
// In an Action or Application Service:
$orderInput = $validatingHydrator->create(CreateOrderInput::class, $requestPayload);

if (!$orderInput->getValidationResult()->isValid()) {
    // Returns nested dot-notation paths: e.g. 'items.0.price' => ['Price must be at least 0.01.']
    $errors = $orderInput->getValidationResult()->getErrorMessagesIndexedByPath();
}
```

### 9.4. Parameter Attributes Catalog & Custom TypeCasters

#### Parameter Attributes Catalog (`Yiisoft\Hydrator\Attribute\Parameter\*`)
| Attribute | Target | Role |
|---|---|---|
| `#[Data('key')]` | Parameter / Property | Maps the parameter to an alternative key in the raw data array. |
| `#[Di('service_id')]` | Parameter / Property | Resolves and injects a service from the PSR-11 container into the DTO constructor. |
| `#[ToDateTime(format: 'Y-m-d')]` | Parameter / Property | Parses a string into a `DateTimeImmutable` instance. |
| `#[ToString]` | Parameter / Property | Casts scalar values explicitly to `string`. |
| `#[ToArrayOfStrings]` | Parameter / Property | Converts an iterable into a flat `array<string>`. |
| `#[Trim(characters: " \t\n\r\0\x0B")]` | Parameter / Property | Trims whitespace or specified characters. |
| `#[LeftTrim]` / `#[RightTrim]` | Parameter / Property | Trims left or right side only. |
| `#[Collection(className: Dto::class)]`| Parameter / Property | Hydrates an array of nested DTOs of the specified class. |
| `#[SkipHydration]` | Parameter / Property | *(Located in `Yiisoft\Hydrator\Attribute\SkipHydration`)*. Excludes property from hydration. |

#### Custom TypeCasters (`TypeCasterInterface`)
To cast custom domain value objects (such as UUIDs, Money, or GeoCoordinates), implement `Yiisoft\Hydrator\TypeCaster\TypeCasterInterface`:

```php
declare(strict_types=1);

namespace App\Application\Shared\Hydrator;

use Ramsey\Uuid\Uuid;
use Ramsey\Uuid\UuidInterface;
use ReflectionNamedType;
use Yiisoft\Hydrator\Result;
use Yiisoft\Hydrator\TypeCaster\TypeCastContext;
use Yiisoft\Hydrator\TypeCaster\TypeCasterInterface;

final class UuidTypeCaster implements TypeCasterInterface
{
    public function cast(mixed $value, TypeCastContext $context): Result
    {
        $type = $context->getReflectionType();

        if (
            $type instanceof ReflectionNamedType
            && is_a($type->getName(), UuidInterface::class, true)
            && is_string($value)
            && Uuid::isValid($value)
        ) {
            return Result::success(Uuid::fromString($value));
        }

        return Result::fail();
    }
}
```

---

## 10. HTTP Request Inputs Mapping (`yiisoft/input-http`)

In Yii 3, HTTP request inputs are mapped directly into action parameters and DTOs using `yiisoft/input-http`:
- Request DTOs extend `Yiisoft\Input\Http\AbstractInput` and declare class-level data attributes (`#[FromBody]`, `#[FromQuery]`).
- Validation rules on DTO properties (`#[Required]`, `#[Length]`, etc.) are evaluated automatically.
- Validated DTOs or individual action parameters decorated with `#[Query]`, `#[Body]`, or `#[UploadedFiles]` are injected directly into action `__invoke()` signatures.

> [!TIP]
> **Action Parameter Mapping & Problem Details Reference:**
> For the complete reference on parameter attributes (`#[Body]`, `#[Query]`, `#[Request]`, `#[UploadedFiles]`), direct action parameter resolution via `HydratorAttributeParametersResolver`, exception-driven validation (`throwInputValidationException`), and RFC 7807 Problem Details error responders, see the [HTTP Actions & Controllers Guide, §3.2](http-actions-and-controllers.md#32-request-parsing--dto-hydration-yiisofthydrator-yiisoftinput-http-yiisoftvalidator).

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
| **Omitting `#[Required]` before `#[Length]`** | Subsequent rules skip empty values by default, allowing empty inputs to pass validation. | Always place `#[Required]` first in the attribute list. |
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
