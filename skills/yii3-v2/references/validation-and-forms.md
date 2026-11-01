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
- [4. Custom Rules & Dependency Injection](#4-custom-rules--dependency-injection)
  - [4.1. Custom Rule & Handler Pair Contract](#41-custom-rule--handler-pair-contract)
  - [4.2. Dependency Injection in Handlers: The RuleHandlerContainer Binding](#42-dependency-injection-in-handlers-the-rulehandlercontainer-binding)
  - [4.3. One-Off Checks with Callback Rule](#43-one-off-checks-with-callback-rule)
- [5. File & Image Validation](#5-file--image-validation)
  - [5.1. File Rule (`Yiisoft\Validator\Rule\File`)](#51-file-rule-yiisoftvalidatorrulefile)
  - [5.2. Image & Aspect Ratio Rules (`Rule\Image\Image`, `ImageAspectRatio`)](#52-image--aspect-ratio-rules-ruleimageimage-imageaspectratio)
  - [5.3. Validating PSR-7 UploadedFileInterface & Multi-File Collections](#53-validating-psr-7-uploadedfileinterface--multi-file-collections)
- [6. Cross-Property Validation & Contextual Comparison](#6-cross-property-validation--contextual-comparison)
  - [6.1. Comparison Rules: targetProperty vs. targetValue](#61-comparison-rules-targetproperty-vs-targetvalue)
  - [6.2. Cross-Property Cardinality: FilledAtLeast, FilledOnlyOneOf](#62-cross-property-cardinality-filledatleast-filledonlyoneof)
  - [6.3. Dynamic Context Inspection via ValidationContext](#63-dynamic-context-inspection-via-validationcontext)
- [7. Messages, Labels, Placeholders & Internationalization](#7-messages-labels-placeholders--internationalization)
  - [7.1. Translation Category 'yii-validator'](#71-translation-category-yii-validator)
  - [7.2. Placeholder Substitution: {Property}, {value}, and Parameter Tokens](#72-placeholder-substitution-property-value-and-parameter-tokens)
  - [7.3. Property Labels via #[Label] and Property Translators](#73-property-labels-via-label-and-property-translators)
  - [7.4. Message Formatters: SimpleMessageFormatter vs. IntlMessageFormatter](#74-message-formatters-simplemessageformatter-vs-intlmessageformatter)
- [8. Form Models & Web Form Lifecycle (`yiisoft/form-model` & `yiisoft/form`)](#8-form-models--web-form-lifecycle-yiisoftform-model--yiisoftform)
  - [8.1. FormModel Base Class & FormModelInterface Contract](#81-formmodel-base-class--formmodelinterface-contract)
  - [8.2. FormHydrator: Population, Scoping, and Mass-Assignment Protection](#82-formhydrator-population-scoping-and-mass-assignment-protection)
  - [8.3. Complete Web Form Lifecycle (FormModel, Controller Action, and CSRF View)](#83-complete-web-form-lifecycle-formmodel-controller-action-and-csrf-view)
  - [8.4. Field Widget Catalog & Automatic HTML5 Validation (ValidationRulesEnricher)](#84-field-widget-catalog--automatic-html5-validation-validationrulesenricher)
- [9. Typed DTO Hydration & ValidatingHydrator (`yiisoft/hydrator`, `yiisoft/hydrator-validator`)](#9-typed-dto-hydration--validatinghydrator-yiisofthydrator-yiisofthydrator-validator)
  - [9.1. Hydrator Architecture & Composite Type Casting](#91-hydrator-architecture--composite-type-casting)
  - [9.2. Two-Stage Validation via ValidatingHydrator & #[Validate]](#92-two-stage-validation-via-validatinghydrator--validate)
  - [9.3. Nested DTOs & Collections (OrderDto & OrderItemDto)](#93-nested-dtos--collections-orderdto--orderitemdto)
  - [9.4. Parameter Attributes Catalog & Custom TypeCasters](#94-parameter-attributes-catalog--custom-typecasters)
- [10. HTTP Request Inputs Mapping (`yiisoft/input-http`)](#10-http-request-inputs-mapping-yiisoftinput-http)
  - [10.1. Class Data Attributes: #[FromBody] & #[FromQuery]](#101-class-data-attributes-frombody--fromquery)
  - [10.2. Parameter Attributes: #[Body], #[Query], #[Request], #[UploadedFiles]](#102-parameter-attributes-body-query-request-uploadedfiles)
  - [10.3. Action Parameter Resolution & Error Dispatching](#103-action-parameter-resolution--error-dispatching)
  - [10.4. RFC 7807 Problem Details Error Responder](#104-rfc-7807-problem-details-error-responder)
- [11. Architectural Decision Matrix (Choosing the Right Tool)](#11-architectural-decision-matrix-choosing-the-right-tool)
- [12. Anti-Pattern Matrix](#12-anti-pattern-matrix)
- [13. Related Topic Guides](#13-related-topic-guides)

---

## 1. Package Architecture & Responsibilities

In Yii 3, validation, object hydration, form modeling, and HTTP request parsing are deliberately decoupled into dedicated, focused packages. Applications install only what their architecture requires (see [Dependency Protocol](dependency-protocol.md)).

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
| `yiisoft/hydrator` | Creates and populates typed objects from arrays with composite type casting, mapping, parameter attributes, and DI resolution | `HydratorInterface::create()`, `hydrate()`, `TypeCasterInterface` | `vendor/yiisoft/hydrator/src/` |
| `yiisoft/hydrator-validator` | Decorator that validates raw input before hydration, populates typed properties, and validates the resulting object; stores `Result` on the DTO | `ValidatingHydrator`, `ValidatedInputInterface`, `ValidatedInputTrait`, `#[Validate]` | `vendor/yiisoft/hydrator-validator/src/` |
| `yiisoft/form-model` | Base class and scoped hydrator for HTML forms, metadata attributes (`#[Hint]`, `#[Placeholder]`, `#[Safe]`), field shortcut facade `Field`, and HTML5 validation enricher | `FormModel`, `FormModelInterface`, `FormHydrator`, `Field`, `ValidationRulesEnricher` | `vendor/yiisoft/form-model/src/` |
| `yiisoft/form` | Model-agnostic HTML form widgets and tag generators (independent of validator and hydrator) | `Yiisoft\Form\PureField\Field`, individual field widgets | `vendor/yiisoft/form/src/` |
| `yiisoft/input-http` | Maps incoming PSR-7 request data (`Body`, `Query`, `UploadedFiles`, `Request` attributes) directly into typed action parameters via middleware dispatcher | `AbstractInput`, `#[FromBody]`, `#[FromQuery]`, `RequestInputParametersResolver` | `vendor/yiisoft/input-http/src/` |
| `yiisoft/request-body-parser` | PSR-15 middleware that parses raw HTTP bodies (such as `application/json`) into `$request->getParsedBody()` | `RequestBodyParser`, `JsonParser` | `vendor/yiisoft/request-body-parser/src/` |
| `yiisoft/csrf` | CSRF token generation, validation middleware, and masking | `CsrfTokenMiddleware`, `CsrfTokenInterface` | `vendor/yiisoft/csrf/src/` |
| `yiisoft/translator` | Message translation and placeholder formatting engine | `TranslatorInterface`, `SimpleMessageFormatter`, `IntlMessageFormatter` | `vendor/yiisoft/translator/src/` |

> [!IMPORTANT]
> To parse JSON request bodies (`application/json`), the PSR-15 middleware `Yiisoft\Request\Body\RequestBodyParser` from `yiisoft/request-body-parser` must be placed in the middleware pipeline before any action or input resolver. If omitted, `$request->getParsedBody()` returns `null` for JSON requests, causing `FromBodyResolver` to silently resolve an empty array `[]`. See [PSR-15 Middlewares Guide](middlewares.md).

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
| `isPropertyValid(string $property)` | `bool` | Returns `true` if no errors exist whose value path begins with `$property`. |
| `getErrors()` | `list<Error>` | Returns the raw list of `Yiisoft\Validator\Error` value objects. |
| `getErrorMessages()` | `list<string>` | Returns a flat list of translated error message strings. |
| `getErrorMessagesIndexedByPath(string $separator = '.', ?string $escape = '.')` | `array<string, non-empty-list<string>>` | Groups error messages by dot-separated path (e.g. `['items.0.price' => ['Price must be at least 1.']]`). **Standard format for REST APIs (RFC 7807).** |
| `getFirstErrorMessagesIndexedByPath(string $separator = '.', ?string $escape = '.')` | `array<string, string>` | Returns the first error message string per dot-separated path. |
| `getErrorMessagesIndexedByProperty()` | `array<string, non-empty-list<string>>` | Groups error messages by root property name. |
| `getFirstErrorMessagesIndexedByProperty()` | `array<string, string>` | Returns the first error message string per root property name. **Standard format for server-rendered HTML forms.** |
| `getPropertyErrorMessages(string $property)` | `list<string>` | Returns all error message strings associated with a single property. |

Each `Yiisoft\Validator\Error` value object exposes:
- `getMessage(): string` — the translated or formatted error message.
- `getParameters(): array` — the parameter key-value pairs passed for translation substitution.
- `getValuePath(?string $escape = null): array` — the path array identifying the nested property (e.g. `['items', 0, 'price']`).
- `getMessageProcessing(): int` — message processing mode (`Error::MESSAGE_TRANSLATE`, `Error::MESSAGE_FORMAT`, `Error::MESSAGE_NONE`).

### 2.3. Exhaustive Built-In Rules Catalog

`yiisoft/validator` ships 42 built-in rule classes. All concrete rule classes are PHP attributes marked `#[Attribute(Attribute::TARGET_PROPERTY | Attribute::IS_REPEATABLE)]`.

> [!IMPORTANT]
> **PHP 8 Named Arguments Invariants:**
> 1. **`Required` has NO `$skipOnEmpty` parameter:** Calling `new Required(skipOnEmpty: ...)` throws a fatal `Error: Unknown named parameter $skipOnEmpty`. Its constructor accepts `$emptyCondition`, `$skipOnError`, `$when`, and `$message`.
> 2. **Positional Parameter Trap in `Length` and `Count`:** The first positional parameter of both `Length` and `Count` is `$exactly`, followed by `$min` and `$max`. Calling `new Length(3, 255)` means `exactly: 3, min: 255`! Always use named arguments: `new Length(min: 3, max: 255)`.
> 3. **Comparison Rules use `$targetProperty`:** The target field in `Equal`, `NotEqual`, `GreaterThan`, etc., is named strictly `$targetProperty` (or `$targetValue`). The legacy Yii 2 name `$targetAttribute` does not exist.

#### 1. Requiredness Rule
| Rule Class | FQCN | Constructor Parameters & Defaults | Modifiers Supported | Handler Class |
|---|---|---|---|---|
| `Required` | `Yiisoft\Validator\Rule\Required` | `?callable $emptyCondition = null`, `bool $skipOnError = false`, `?Closure $when = null`, `string $message = '{Property} cannot be blank.'`, `string $notPassedMessage = '{Property} not passed.'` | `skipOnError`, `when` (**NO `skipOnEmpty`**) | `RequiredHandler` |

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
| `Length` | `Yiisoft\Validator\Rule\Length` | `?int $exactly = null`, `?int $min = null`, `?int $max = null`, `string $encoding = 'UTF-8'`, `mixed $skipOnEmpty = null`, `bool $skipOnError = false`, `?Closure $when = null` | `skipOnEmpty`, `skipOnError`, `when` | `LengthHandler` |
| `Email` | `Yiisoft\Validator\Rule\Email` | `string $pattern = ...`, `bool $allowName = false`, `bool $checkDns = false`, `bool $enableIdn = false`, `mixed $skipOnEmpty = null`, `bool $skipOnError = false`, `?Closure $when = null` | `skipOnEmpty`, `skipOnError`, `when` | `EmailHandler` |
| `Regex` | `Yiisoft\Validator\Rule\Regex` | `string $pattern`, `bool $not = false`, `string $message = '{Property} is invalid.'`, `mixed $skipOnEmpty = null`, `bool $skipOnError = false`, `?Closure $when = null` | `skipOnEmpty`, `skipOnError`, `when` | `RegexHandler` |
| `Url` | `Yiisoft\Validator\Rule\Url` | `array $validSchemes = ['http', 'https']`, `string $pattern = ...`, `bool $enableIdn = false`, `mixed $skipOnEmpty = null`, `bool $skipOnError = false`, `?Closure $when = null` | `skipOnEmpty`, `skipOnError`, `when` | `UrlHandler` |
| `Uuid` | `Yiisoft\Validator\Rule\Uuid` | `string $message = 'The value of {property} is not a valid UUID.'`, `mixed $skipOnEmpty = null`, `bool $skipOnError = false`, `?Closure $when = null` | `skipOnEmpty`, `skipOnError`, `when` | `UuidHandler` |
| `Ip` | `Yiisoft\Validator\Rule\Ip` | `array $networks = []`, `bool $allowIpv4 = true`, `bool $allowIpv6 = true`, `bool $allowSubnet = false`, `bool $requireSubnet = false`, `bool $allowNegation = false`, `mixed $skipOnEmpty = null`, `bool $skipOnError = false`, `?Closure $when = null` | `skipOnEmpty`, `skipOnError`, `when` | `IpHandler` |
| `Json` | `Yiisoft\Validator\Rule\Json` | `string $message = '{Property} is not a valid JSON.'`, `mixed $skipOnEmpty = null`, `bool $skipOnError = false`, `?Closure $when = null` | `skipOnEmpty`, `skipOnError`, `when` | `JsonHandler` |

#### 5. Comparison Rules (Extend `AbstractCompare`)
> [!NOTE]
> In all comparison rules, `$skipOnEmpty` defaults to `false` (unlike other rules where it defaults to `null`).

| Rule Class | FQCN | Constructor Parameters & Defaults | Modifiers Supported | Handler Class |
|---|---|---|---|---|
| `Compare` | `Yiisoft\Validator\Rule\Compare` | `mixed $targetValue = null`, `?string $targetProperty = null`, `string $operator = '=='`, `string $type = CompareType::NUMBER`, `mixed $skipOnEmpty = null`, `bool $skipOnError = false`, `?Closure $when = null` | `skipOnEmpty`, `skipOnError`, `when` | `CompareHandler` |
| `Equal` | `Yiisoft\Validator\Rule\Equal` | `mixed $targetValue = null`, `?string $targetProperty = null`, `string $type = CompareType::NUMBER`, `bool $strict = false`, `mixed $skipOnEmpty = false`, `bool $skipOnError = false`, `?Closure $when = null` | `skipOnEmpty: false`, `skipOnError`, `when` | `CompareHandler` |
| `NotEqual` | `Yiisoft\Validator\Rule\NotEqual` | `mixed $targetValue = null`, `?string $targetProperty = null`, `string $type = CompareType::NUMBER`, `bool $strict = false`, `mixed $skipOnEmpty = false`, `bool $skipOnError = false`, `?Closure $when = null` | `skipOnEmpty: false`, `skipOnError`, `when` | `CompareHandler` |
| `GreaterThan` | `Yiisoft\Validator\Rule\GreaterThan` | `mixed $targetValue = null`, `?string $targetProperty = null`, `string $type = CompareType::NUMBER`, `mixed $skipOnEmpty = false`, `bool $skipOnError = false`, `?Closure $when = null` | `skipOnEmpty: false`, `skipOnError`, `when` | `CompareHandler` |
| `GreaterThanOrEqual` | `Yiisoft\Validator\Rule\GreaterThanOrEqual` | `mixed $targetValue = null`, `?string $targetProperty = null`, `string $type = CompareType::NUMBER`, `mixed $skipOnEmpty = false`, `bool $skipOnError = false`, `?Closure $when = null` | `skipOnEmpty: false`, `skipOnError`, `when` | `CompareHandler` |
| `LessThan` | `Yiisoft\Validator\Rule\LessThan` | `mixed $targetValue = null`, `?string $targetProperty = null`, `string $type = CompareType::NUMBER`, `mixed $skipOnEmpty = false`, `bool $skipOnError = false`, `?Closure $when = null` | `skipOnEmpty: false`, `skipOnError`, `when` | `CompareHandler` |
| `LessThanOrEqual` | `Yiisoft\Validator\Rule\LessThanOrEqual` | `mixed $targetValue = null`, `?string $targetProperty = null`, `string $type = CompareType::NUMBER`, `mixed $skipOnEmpty = false`, `bool $skipOnError = false`, `?Closure $when = null` | `skipOnEmpty: false`, `skipOnError`, `when` | `CompareHandler` |

#### 6. Collections & Iteration Rules
| Rule Class | FQCN | Constructor Parameters & Defaults | Modifiers Supported | Handler Class |
|---|---|---|---|---|
| `Count` | `Yiisoft\Validator\Rule\Count` | `?int $exactly = null`, `?int $min = null`, `?int $max = null`, `mixed $skipOnEmpty = null`, `bool $skipOnError = false`, `?Closure $when = null` | `skipOnEmpty`, `skipOnError`, `when` | `CountHandler` |
| `Each` | `Yiisoft\Validator\Rule\Each` | `callable\|iterable\|object\|string $rules = []`, `bool $stopOnError = false`, `mixed $skipOnEmpty = null`, `bool $skipOnError = false`, `?Closure $when = null` | `skipOnEmpty`, `skipOnError`, `when` | `EachHandler` |
| `In` | `Yiisoft\Validator\Rule\In` | `iterable $values`, `bool $strict = false`, `bool $not = false`, `mixed $skipOnEmpty = null`, `bool $skipOnError = false`, `?Closure $when = null` | `skipOnEmpty`, `skipOnError`, `when` | `InHandler` |
| `InEnum` | `Yiisoft\Validator\Rule\InEnum` | `class-string<UnitEnum> $class`, `bool $useNames = false`, `bool $strict = false`, `bool $not = false`, `mixed $skipOnEmpty = null`, `bool $skipOnError = false`, `?Closure $when = null` | `skipOnEmpty`, `skipOnError`, `when` | `InEnumHandler` |
| `Subset` | `Yiisoft\Validator\Rule\Subset` | `iterable $values`, `bool $strict = false`, `mixed $skipOnEmpty = null`, `bool $skipOnError = false`, `?Closure $when = null` | `skipOnEmpty`, `skipOnError`, `when` | `SubsetHandler` |
| `UniqueIterable` | `Yiisoft\Validator\Rule\UniqueIterable` | `string $message = 'Every iterable\'s item of {property} must be unique.'`, `mixed $skipOnEmpty = null`, `bool $skipOnError = false`, `?Closure $when = null` | `skipOnEmpty`, `skipOnError`, `when` | `UniqueIterableHandler` |

#### 7. Structural & Flow Combinator Rules
| Rule Class | FQCN | Constructor Parameters & Defaults | Modifiers Supported | Handler Class |
|---|---|---|---|---|
| `Nested` | `Yiisoft\Validator\Rule\Nested` | `iterable\|object\|string\|null $rules = null`, `bool $requirePropertyPath = false`, `bool $handleEachShortcut = true`, `bool $propagateOptions = false`, `mixed $skipOnEmpty = null`, `bool $skipOnError = false`, `?Closure $when = null` | `skipOnEmpty`, `skipOnError`, `when` | `NestedHandler` |
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
| `Image` | `Yiisoft\Validator\Rule\Image\Image` | `?int $width = null`, `?int $height = null`, `?int $minWidth = null`, `?int $minHeight = null`, `?int $maxWidth = null`, `?int $maxHeight = null`, `?ImageAspectRatio $aspectRatio = null`, `mixed $skipOnEmpty = null`, `bool $skipOnError = false`, `?Closure $when = null` | `skipOnEmpty`, `skipOnError`, `when` | `Image\ImageHandler` |
| `ImageAspectRatio` | `Yiisoft\Validator\Rule\Image\ImageAspectRatio` | `int $width`, `int $height`, `float $margin = 0` | Value object companion | Evaluated by `ImageHandler` |

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
> Always place `#[Required]` **first** in the attribute stack. Subsequent rules implement `SkipOnEmptyInterface` and skip validation if the value is empty (`""` or `null`). If `#[Required]` is missing or placed after other rules, empty inputs will bypass validation and pass cleanly.

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
- `null` (default): uses the validator's global default.
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
- **`AnyRule([...])` (Logical OR):** Succeeds if at least one rule in the collection passes. If all fail, returns a composite error:
  ```php
  #[AnyRule([
      new Regex(pattern: '/^\+?[1-9]\d{1,14}$/'), // E.164 phone format
      new Email(),
  ], message: '{Property} must be a valid telephone number or email address.')]
  public string $contactIdentifier = '';
  ```
- **`Composite([...], skipOnEmpty: ..., when: ...)`:** Bundles multiple rules so they can share common `skipOnEmpty`, `skipOnError`, or `when` modifiers.

---

## 4. Custom Rules & Dependency Injection

### 4.1. Custom Rule & Handler Pair Contract

Custom rules in Yii 3 follow a strict decoupled architecture:
1. **Rule Class (`RuleInterface`):** An immutable configuration value object carrying options and error message templates.
2. **Rule Handler Class (`RuleHandlerInterface`):** An execution service performing the actual check.

```
+---------------------------+                +-------------------------------+
|     Rule (Value Object)   |                |    RuleHandler (Service)      |
|  implements RuleInterface | -------------> |  implements RuleHandlerInterface
|  - message templates      |  delegates to  |  - validate($val, $rule, $ctx)|
|  - constructor options    |  via           |  - injects DB / repositories  |
|  - getHandler(): string   |  getHandler()  |  - returns Result             |
+---------------------------+                +-------------------------------+
```

The handler must throw `Yiisoft\Validator\Exception\UnexpectedRuleException` if invoked with an incompatible rule.

### 4.2. Dependency Injection in Handlers: The RuleHandlerContainer Binding

> [!CAUTION]
> **The `SimpleRuleHandlerContainer` Trap:**
> In `yiisoft/validator`'s default `config/di.php`, `RuleHandlerResolverInterface::class` is bound to `Yiisoft\Validator\RuleHandlerResolver\SimpleRuleHandlerContainer`.
> `SimpleRuleHandlerContainer` instantiates handlers using `new $handlerName()`. If your custom rule handler injects application dependencies (such as a database connection, repository, or hasher), validation fails with:
> `ArgumentCountError: Too few arguments to function ...Handler::__construct(), 0 passed`.

#### The Solution: Rebind to `RuleHandlerContainer`
Rebind `RuleHandlerResolverInterface` in your application's `config/common/di/validator.php` to `RuleHandlerContainer`. `RuleHandlerContainer` delegates handler instantiation to the PSR-11 container:

```php
// config/common/di/validator.php
declare(strict_types=1);

use Yiisoft\Validator\RuleHandlerResolverInterface;
use Yiisoft\Validator\RuleHandlerResolver\RuleHandlerContainer;

return [
    RuleHandlerResolverInterface::class => RuleHandlerContainer::class,
];
```

#### Complete Recipe: Service-Injected Unique Email Rule

```php
declare(strict_types=1);

namespace App\Application\Shared\Validator\Rule;

use Attribute;
use Yiisoft\Validator\Rule\Trait\SkipOnEmptyTrait;
use Yiisoft\Validator\Rule\Trait\SkipOnErrorTrait;
use Yiisoft\Validator\Rule\Trait\WhenTrait;
use Yiisoft\Validator\RuleInterface;
use Yiisoft\Validator\SkipOnEmptyInterface;
use Yiisoft\Validator\SkipOnErrorInterface;
use Yiisoft\Validator\WhenInterface;

#[Attribute(Attribute::TARGET_PROPERTY | Attribute::IS_REPEATABLE)]
final class UniqueUserEmail implements RuleInterface, SkipOnEmptyInterface, SkipOnErrorInterface, WhenInterface
{
    use SkipOnEmptyTrait;
    use SkipOnErrorTrait;
    use WhenTrait;

    public function __construct(
        public readonly string $message = 'User with email "{value}" is already registered.',
        mixed $skipOnEmpty = null,
        bool $skipOnError = false,
        ?\Closure $when = null,
    ) {
        $this->skipOnEmpty = $skipOnEmpty;
        $this->skipOnError = $skipOnError;
        $this->when = $when;
    }

    public function getHandler(): string
    {
        return UniqueUserEmailHandler::class;
    }
}
```

```php
declare(strict_types=1);

namespace App\Application\Shared\Validator\Rule;

use App\Domain\User\UserRepositoryInterface;
use Yiisoft\Validator\Exception\UnexpectedRuleException;
use Yiisoft\Validator\Result;
use Yiisoft\Validator\RuleHandlerInterface;
use Yiisoft\Validator\RuleInterface;
use Yiisoft\Validator\ValidationContext;

final readonly class UniqueUserEmailHandler implements RuleHandlerInterface
{
    public function __construct(
        private UserRepositoryInterface $userRepository,
    ) {}

    public function validate(mixed $value, RuleInterface $rule, ValidationContext $context): Result
    {
        if (!$rule instanceof UniqueUserEmail) {
            throw new UnexpectedRuleException(UniqueUserEmail::class, $rule);
        }

        $result = new Result();
        if (!is_string($value) || $value === '') {
            return $result;
        }

        if ($this->userRepository->hasByEmail($value)) {
            $result->addError($rule->message, [
                'property' => $context->getTranslatedProperty(),
                'Property' => $context->getCapitalizedTranslatedProperty(),
                'value' => $value,
            ]);
        }

        return $result;
    }
}
```

### 4.3. One-Off Checks with Callback Rule

For domain validations unique to a single DTO that do not warrant a full rule-handler pair, use `Callback`:

```php
declare(strict_types=1);

namespace App\Application\Auth\Dto;

use Yiisoft\Validator\Result;
use Yiisoft\Validator\Rule\Callback;
use Yiisoft\Validator\Rule\Required;
use Yiisoft\Validator\ValidationContext;

final class ChangePasswordInput
{
    #[Required]
    public string $oldPassword = '';

    #[Required]
    #[Callback(method: 'validateNewPasswordNotSame')]
    public string $newPassword = '';

    public function validateNewPasswordNotSame(mixed $value, Callback $rule, ValidationContext $context): Result
    {
        $result = new Result();
        if ($value === $this->oldPassword) {
            $result->addError('New password must differ from the current password.', [
                'property' => $context->getTranslatedProperty(),
            ]);
        }
        return $result;
    }
}
```

---

## 5. File & Image Validation

### 5.1. File Rule (`Yiisoft\Validator\Rule\File`)

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

### 5.3. Validating PSR-7 UploadedFileInterface & Multi-File Collections

When receiving an array of uploaded files, wrap `File` or `Image` inside `Each`:

```php
declare(strict_types=1);

namespace App\Application\Gallery\Dto;

use Psr\Http\Message\UploadedFileInterface;
use Yiisoft\Hydrator\Attribute\Parameter\Data;
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

### 7.1. Translation Category 'yii-validator'

All built-in error messages in `yiisoft/validator` are translated using `Yiisoft\Translator\TranslatorInterface` under the default category **`'yii-validator'`** (`Yiisoft\Validator\Validator::DEFAULT_TRANSLATION_CATEGORY`).

The package ships official translations in `vendor/yiisoft/validator/messages/<locale>/yii-validator.php` (e.g. Russian, German, French, Spanish, Ukrainian).

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
- `getPropertyLabel(string $property): string` — resolves label from `getPropertyLabels()`, `#[Label]`, or inflects the property name.
- `getPropertyHint(string $property): string` — retrieves hint from `#[\Yiisoft\FormModel\Attribute\Hint]`.
- `getPropertyPlaceholder(string $property): string` — retrieves placeholder from `#[\Yiisoft\FormModel\Attribute\Placeholder]`.
- `isValid(): bool` / `isValidated(): bool` — queries validation state.
- `getValidationResult(): Result` — returns the accumulated validation result.

> [!CAUTION]
> **`FormModel::addError()` Precondition Trap:**
> `FormModel::addError(string $message, array $valuePath = []): static` calls `$this->getValidationResult()->addErrorWithoutPostProcessing(...)`.
> If called **before** the model has been validated, `getValidationResult()` throws:
> `LogicException: Validation result is not set.`
> Only call `addError()` after `populate*AndValidate()` has executed.

### 8.2. FormHydrator: Population, Scoping, and Mass-Assignment Protection

`Yiisoft\FormModel\FormHydrator` populates form models from HTTP requests and coordinates validation.

Method signatures (`vendor/yiisoft/form-model/src/FormHydrator.php`):
```php
public function populate(FormModelInterface $model, mixed $data, ?array $map = null, ?bool $strict = null, ?string $scope = null): bool;
public function validate(FormModelInterface $model): Result;
public function populateAndValidate(FormModelInterface $model, mixed $data, ?array $map = null, ?bool $strict = null, ?string $scope = null): bool;

public function populateFromPost(FormModelInterface $model, ServerRequestInterface $request, ?array $map = null, ?bool $strict = null, ?string $scope = null): bool;
public function populateFromPostAndValidate(FormModelInterface $model, ServerRequestInterface $request, ?array $map = null, ?bool $strict = null, ?string $scope = null): bool;
```

#### Tail Arguments Semantics
- **`$scope`:** The array key in `$data` to read from. Defaults to `$model->getFormName()`. Setting `$scope = ''` reads from the root array.
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

---

### 8.3. Complete Web Form Lifecycle (FormModel, Controller Action, and CSRF View)

#### 1. Form Model
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

#### 2. Controller Action
```php
declare(strict_types=1);

namespace App\Presentation\Web\Contact;

use App\Application\Contact\ContactUseCase;
use App\Presentation\Web\Contact\Form\ContactForm;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Yiisoft\FormModel\FormHydrator;
use Yiisoft\Yii\View\Renderer\WebViewRenderer;

final readonly class ContactAction
{
    public function __construct(
        private WebViewRenderer $viewRenderer,
        private FormHydrator $formHydrator,
        private ContactUseCase $contactUseCase,
    ) {}

    public function __invoke(ServerRequestInterface $request): ResponseInterface
    {
        $form = new ContactForm();

        if ($request->getMethod() === 'POST') {
            if ($this->formHydrator->populateFromPostAndValidate($form, $request)) {
                $this->contactUseCase->handle(
                    name: $form->name,
                    email: $form->email,
                    message: $form->message,
                    referrer: $form->referrer,
                );
                return $this->viewRenderer->render('contact/success');
            }
        }

        return $this->viewRenderer->render('contact/form', [
            'form' => $form,
        ]);
    }
}
```

#### 3. View Template (`views/contact/form.php`)
```php
<?php

declare(strict_types=1);

/**
 * @var Yiisoft\View\WebView $this
 * @var App\Presentation\Web\Contact\Form\ContactForm $form
 * @var Yiisoft\Yii\View\Renderer\Csrf $csrf
 */

use Yiisoft\FormModel\Field;
use Yiisoft\Html\Html;

$this->setTitle('Contact Us');
?>

<h1><?= Html::encode($this->getTitle()) ?></h1>

<?= Html::form()
    ->post('/contact')
    ->csrf($csrf)
    ->open() ?>

    <?= Field::errorSummary($form) ?>

    <?= Field::text($form, 'name') ?>
    <?= Field::email($form, 'email') ?>
    <?= Field::textarea($form, 'message') ?>
    <?= Field::hidden($form, 'referrer') ?>

    <div class="form-group mt-3">
        <?= Field::submitButton('Send Message') ?>
    </div>

<?= Html::form()->close() ?>
```

> [!NOTE]
> **CSRF Integration Mechanics:**
> - `Yiisoft\Yii\View\Renderer\CsrfViewInjection` automatically injects the `$csrf` view variable (an instance of `Yiisoft\Yii\View\Renderer\Csrf`) into every rendered template.
> - `Html::form()->csrf($csrf)->open()` automatically generates the `<input type="hidden" name="_csrf" value="...">` tag inside the form.
> - `Yiisoft\Csrf\CsrfTokenMiddleware` validates the token before the controller executes. Form models do **not** need a `_csrf` property.

---

### 8.4. Field Widget Catalog & Automatic HTML5 Validation (ValidationRulesEnricher)

`Yiisoft\FormModel\Field` is a static shortcut factory that binds form properties to `yiisoft/form` widgets:

| Field Method | Rendered HTML Widget | Notes |
|---|---|---|
| `Field::text($form, 'name')` | `<input type="text">` | Automatically receives HTML5 `required`, `minlength`, `maxlength` |
| `Field::password($form, 'password')` | `<input type="password">` | Client-side attribute enrichment |
| `Field::hidden($form, 'id')` | `<input type="hidden">` | Rendered without label/hint wrappers |
| `Field::textarea($form, 'message')` | `<textarea>` | Uses `minlength` and `maxlength` from `Length` |
| `Field::email($form, 'email')` | `<input type="email">` | Type set to email |
| `Field::telephone($form, 'phone')` | `<input type="tel">` | Method is `telephone()`, NOT `tel()` |
| `Field::number($form, 'quantity')` | `<input type="number">` | Derives `min`/`max` from `Integer` or `Number` |
| `Field::checkbox($form, 'agree')` | `<input type="checkbox">` | Boolean binding |
| `Field::checkboxList($form, 'roles')` | Checkbox collection | Set items via `->items(['admin' => 'Admin'])` |
| `Field::radioList($form, 'status')` | Radio buttons list | **Method is `radioList()`; there is NO `Field::radio()`** |
| `Field::select($form, 'country')` | `<select>` dropdown | Set options via `->optionsData(['US' => 'USA'])` |
| `Field::file($form, 'document')` | `<input type="file">` | Multi-file or single-file input |
| `Field::submitButton('Save')` | `<button type="submit">` | **Method is `submitButton()`; there is NO `Field::submit()`** |
| `Field::resetButton('Reset')` | `<button type="reset">` | **Method is `resetButton()`; there is NO `Field::reset()`** |
| `Field::button('Click')` | `<button type="button">` | Plain button |
| `Field::errorSummary($form)` | Alert box of all errors | Renders list of first property errors |

#### `ValidationRulesEnricher`
When rendering fields via `Field::*`, `Yiisoft\FormModel\ValidationRulesEnricher` automatically inspects `yiisoft/validator` attributes on the model property and generates standard HTML5 client-side attributes:
- `#[Required]` &rarr; `required`
- `#[Length(min: 3, max: 20)]` &rarr; `minlength="3"` and `maxlength="20"`
- `#[Integer(min: 1, max: 100)]` &rarr; `min="1"` and `max="100"`
- `#[Regex(pattern: '/^[A-Z]+$/')]` &rarr; `pattern="^[A-Z]+$"`
- Rules with active `when:` conditions are excluded from client-side enrichment to avoid conflicting states.

---

## 9. Typed DTO Hydration & ValidatingHydrator (`yiisoft/hydrator`, `yiisoft/hydrator-validator`)

### 9.1. Hydrator Architecture & Composite Type Casting

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
use Yiisoft\Validator\Rule\Nested;
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

### 10.1. Class Data Attributes: #[FromBody] & #[FromQuery]

`yiisoft/input-http` resolves action method parameters implementing `Yiisoft\Input\Http\RequestInputInterface` (or extending `Yiisoft\Input\Http\AbstractInput`).

Class-level data attributes (`Yiisoft\Input\Http\Attribute\Data\*`):
- `#[FromBody(name: null, map: [], strict: false)]` &rarr; reads from `$request->getParsedBody()`.
- `#[FromQuery(name: null, map: [], strict: false)]` &rarr; reads from `$request->getQueryParams()`.

Setting `$name = 'user'` extracts a nested key from the body or query parameters.

> [!WARNING]
> There are strictly **NO** `#[FromRoute]`, `#[FromHeader]`, or `#[FromCookie]` class data attributes in `yiisoft/input-http`. Route parameters are retrieved via `Yiisoft\Router\CurrentRoute` or `#[Request]`. Headers are retrieved via PSR-7 `$request->getHeaderLine()`.

```php
declare(strict_types=1);

namespace App\Presentation\Api\Post\Input;

use Yiisoft\Input\Http\AbstractInput;
use Yiisoft\Input\Http\Attribute\Data\FromBody;
use Yiisoft\Validator\Rule\Length;
use Yiisoft\Validator\Rule\Required;

#[FromBody]
final class CreatePostInput extends AbstractInput
{
    #[Required]
    #[Length(min: 3, max: 255)]
    public string $title = '';
}
```

### 10.2. Parameter Attributes: #[Body], #[Query], #[Request], #[UploadedFiles]

Parameter attributes (`Yiisoft\Input\Http\Attribute\Parameter\*`) pull specific request segments:
- `#[Body('title')]` &rarr; extracts a single property from the request body.
- `#[Query('page')]` &rarr; extracts a query parameter.
- `#[UploadedFiles('avatar')]` &rarr; extracts an uploaded file from `$request->getUploadedFiles()`.
- **`#[Request('attributeName')]`:** Reads from **PSR-7 request attributes** (`$request->getAttributes()`), such as router match parameters or middleware context. **It does NOT read HTTP headers.**

### 10.3. Action Parameter Resolution & Error Dispatching

Action handler configuration:
```php
declare(strict_types=1);

namespace App\Presentation\Api\Post;

use App\Application\Post\CreatePostService;
use App\Presentation\Api\Post\Input\CreatePostInput;
use App\Presentation\Api\Shared\ValidationProblemDetailsResponder;
use Psr\Http\Message\ResponseFactoryInterface;
use Psr\Http\Message\ResponseInterface;
use Yiisoft\Http\Header;
use Yiisoft\Http\Status;

final readonly class CreatePostAction
{
    public function __construct(
        private ValidationProblemDetailsResponder $problemDetailsResponder,
        private CreatePostService $postService,
        private ResponseFactoryInterface $responseFactory,
    ) {}

    public function __invoke(CreatePostInput $input): ResponseInterface
    {
        if (!$input->getValidationResult()->isValid()) {
            return $this->problemDetailsResponder->respond($input->getValidationResult());
        }

        $post = $this->postService->create($input->title);

        return $this->responseFactory
            ->createResponse(Status::CREATED)
            ->withHeader(Header::LOCATION, '/posts/' . $post->getId());
    }
}
```

#### Exception-Driven Flow (`throwInputValidationException`)
In `config/common/params.php`:
```php
declare(strict_types=1);

return [
    'yiisoft/input-http' => [
        'requestInputParametersResolver' => [
            'throwInputValidationException' => true, // Default is false
        ],
    ],
];
```
When set to `true`, invalid inputs throw `Yiisoft\Input\Http\InputValidationException` before the action executes, which can be handled centrally by an exception middleware.

### 10.4. RFC 7807 Problem Details Error Responder

```php
declare(strict_types=1);

namespace App\Presentation\Api\Shared;

use Psr\Http\Message\ResponseInterface;
use Yiisoft\DataResponse\DataResponseFactoryInterface;
use Yiisoft\Http\Header;
use Yiisoft\Http\Status;
use Yiisoft\Input\Http\InputValidationException;
use Yiisoft\Validator\Result;

final readonly class ValidationProblemDetailsResponder
{
    public function __construct(
        private DataResponseFactoryInterface $responseFactory,
    ) {}

    public function respond(Result|InputValidationException $validation): ResponseInterface
    {
        $result = $validation instanceof InputValidationException
            ? $validation->getResult()
            : $validation;

        $payload = [
            'type' => 'https://tools.ietf.org/html/rfc4918#section-11.2',
            'title' => 'Validation Failed',
            'status' => Status::UNPROCESSABLE_ENTITY,
            'detail' => 'One or more parameters failed validation.',
            'invalid_params' => $result->getErrorMessagesIndexedByPath(),
        ];

        return $this->responseFactory
            ->createResponse($payload, Status::UNPROCESSABLE_ENTITY)
            ->withHeader(Header::CONTENT_TYPE, 'application/problem+json');
    }
}
```

---

## 11. Architectural Decision Matrix (Choosing the Right Tool)

| Scenario | Recommended Approach | Key Packages & Classes | Rationale |
|---|---|---|---|
| **JSON REST API Endpoint** | Typed DTO with `#[FromBody]` extending `AbstractInput` | `yiisoft/input-http`, `yiisoft/hydrator-validator`, `ValidatingHydrator` | Decoupled from HTML; maps directly into controller action signature; two-stage pre/post validation. |
| **Server-Rendered HTML Web Form** | `FormModel` + `FormHydrator::populateFromPostAndValidate()` | `yiisoft/form-model`, `yiisoft/form`, `yiisoft/csrf` | Scoped inputs (`Form[field]`), automatic HTML5 attribute enrichment, labels/hints metadata, CSRF support. |
| **Complex Domain DTO / Value Object** | Constructor-promoted typed DTO + `#[Validate]` | `yiisoft/hydrator-validator`, `#[Validate]`, custom `TypeCasterInterface` | Ensures raw strings cannot trigger fatal `TypeError`s during instantiation; deep collection mapping. |
| **Ad-Hoc One-Off Validation** | `$validator->validate($data, $rules)` with plain array map | `yiisoft/validator`, `ValidatorInterface`, `Rule\*` | Fast, lightweight validation of decoded arrays without defining single-use classes. |
| **Domain Layer Invariant Enforcement** | Strict rules (`Rule\Type\*`) + Custom Rules | `yiisoft/validator`, `Rule\Type\*`, `RuleHandlerInterface` | Prevents HTTP string leniency (`"0"` &rarr; `false`) from corrupting domain logic. |
| **Route Parameters** | `CurrentRoute::getArgument()` + explicit rule validation | `yiisoft/router`, `CurrentRoute`, `ValidatorInterface` | `input-http` does not map route arguments; keeping route parameters distinct preserves clarity. |

---

## 12. Anti-Pattern Matrix

| Forbidden Anti-Pattern | Why It Breaks | Grounded Idiomatic Solution |
|---|---|---|
| **Assuming `Result` is an immutable value object** | `Result::addError()` mutates state in-place. Reusing instances contaminates distinct validations | Treat `Result` as a mutable accumulator. Instantiate a fresh `new Result()` per validation pass. |
| **Passing `skipOnEmpty:` to `new Required()`** | `Required` constructor does NOT accept `$skipOnEmpty`. Causes fatal `Error: Unknown named parameter $skipOnEmpty` | Only pass `$emptyCondition`, `$skipOnError`, `$when`, `$message` to `Required`. |
| **Positional arguments in `new Length(3, 255)`** | First positional parameter is `$exactly`. Causes `exactly: 3, min: 255` | Always use explicit PHP 8 named arguments: `new Length(min: 3, max: 255)`. |
| **Calling `FormModel::addError()` before validation** | Throws `LogicException: Validation result is not set.` | Only add manual domain errors after `populate*AndValidate()` has executed; check `isValidated()`. |
| **Relying on `SimpleRuleHandlerContainer` with DI** | Default container uses `new $class()`. Handlers with dependencies fail with `ArgumentCountError` | Rebind `RuleHandlerResolverInterface::class => RuleHandlerContainer::class` in `config/di.php`. |
| **Assuming `#[Request]` reads HTTP headers** | `#[Request]` strictly reads PSR-7 request **attributes** (`$request->getAttributes()`) | Read HTTP headers via PSR-7 `$request->getHeaderLine()`. There is no header attribute in `input-http`. |
| **Inventing `Field::submit()`, `Field::radio()`, `Field::reset()`** | These method names do not exist on `Yiisoft\FormModel\Field` and cause fatal method not found errors | Use `Field::submitButton()`, `Field::radioList()`, `Field::resetButton()`. |
| **Importing `#[Label]` from `yiisoft/form-model`** | `#[Label]` does NOT exist in `yiisoft/form-model`. Causes fatal `Class not found` | Import `Yiisoft\Validator\Label`. Hints (`#[Hint]`) and placeholders (`#[Placeholder]`) come from `form-model`. |
| **Inventing phantom `SimplePropertyTranslator`** | Class does not exist in `yiisoft/validator` | Use `NullPropertyTranslator`, `ArrayPropertyTranslator`, or `TranslatorPropertyTranslator`. |
| **Inventing `#[FromRoute]`, `#[FromHeader]`, `#[FromCookie]`** | Attributes do not exist in `yiisoft/input-http` | Access route parameters via `CurrentRoute`, headers via `$request->getHeaderLine()`. |
| **Omitted `RequestBodyParser` middleware for JSON** | `$request->getParsedBody()` is `null`; hydration silently resolves an empty array | Register `Yiisoft\Request\Body\RequestBodyParser` in the middleware pipeline prior to actions. |
| **Omitting `#[Required]` before `#[Length]`** | Subsequent rules skip empty values by default, allowing empty inputs to pass validation | Always place `#[Required]` first in the attribute list. |
| **Importing `NonArrayTypeCaster` from `yiisoft/hydrator`** | Class does not exist in `hydrator` | Import `Yiisoft\FormModel\NonArrayTypeCaster` from `yiisoft/form-model`. |

---

## 13. Related Topic Guides

- [Actions & Controllers Guide](actions-and-controllers.md) — Hydrating DTOs and handling FormModels inside Web and API controllers.
- [Views, Layouts & Widgets Guide](views-and-widgets.md) — View rendering, asset management, and field widget configurations.
- [PSR-15 Middlewares Guide](middlewares.md) — Configuring `RequestBodyParser`, `CsrfTokenMiddleware`, and request pipeline ordering.
- [Routing Guide](routes.md) — Inspecting route parameters via `CurrentRoute`.
- [Error Handling Guide](error-handling.md) — Centralized exception responders and Problem Details formatting.
- [Dependency Protocol](dependency-protocol.md) — Package dependency resolution and installation rules.
