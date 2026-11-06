# Yii3 Validation Rules: Core Engine & Rule Declaration

> [!IMPORTANT]
> **Grounding rule:** sources of truth are split by question type — API: installed `vendor/yiisoft/<pkg>/src/` (versions via `composer.lock`); implementation patterns: this guide; project conventions: the project's architecture artifact or dominant `src/` style. Full table and conflict rule: SKILL.md Core rule 2.

> Part of the [Validation & Forms Guide](http-validation-and-forms.md) split — the index, decision matrix, anti-pattern matrix, and related guides live there.

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

`yiisoft/validator` ships 42 built-in rule classes. Nearly all concrete rule classes are PHP attributes marked `#[Attribute(Attribute::TARGET_PROPERTY | Attribute::IS_REPEATABLE)]`. Ten rules also add `Attribute::TARGET_CLASS` — `Composite`, `Nested`, `Each`, `Count`, `Callback`, `AnyRule`, `StopOnError`, `UniqueIterable`, `FilledAtLeast`, `FilledOnlyOneOf` — so they can additionally be attached to a class (e.g. to validate the object as a whole).

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
| `BooleanValue` | `Yiisoft\Validator\Rule\BooleanValue` | `mixed $trueValue = '1'`, `mixed $falseValue = '0'`, `bool $strict = false`, `string $incorrectInputMessage = 'The allowed types for {property} are integer, float, string, boolean. {type} given.'`, `string $message = '{Property} must be either "{true}" or "{false}".'`, `bool\|callable\|null $skipOnEmpty = null`, `bool $skipOnError = false`, `?Closure $when = null` | `skipOnEmpty`, `skipOnError`, `when` | `BooleanValueHandler` |
| `Integer` | `Yiisoft\Validator\Rule\Integer` | `float\|int\|null $min = null`, `float\|int\|null $max = null`, `string $incorrectInputMessage = 'The allowed types for {property} are integer, float and string. {type} given.'`, `string $notNumberMessage = '{Property} must be an integer.'`, `string $lessThanMinMessage = '{Property} must be no less than {min}.'`, `string $greaterThanMaxMessage = '{Property} must be no greater than {max}.'`, `string $pattern = '/^\s*[+-]?\d+\s*$/'`, `bool\|callable\|null $skipOnEmpty = null`, `bool $skipOnError = false`, `?Closure $when = null` | `skipOnEmpty`, `skipOnError`, `when` | `NumberHandler` |
| `Number` | `Yiisoft\Validator\Rule\Number` | `float\|int\|null $min = null`, `float\|int\|null $max = null`, `string $incorrectInputMessage = 'The allowed types for {property} are integer, float and string. {type} given.'`, `string $notNumberMessage = '{Property} must be a number.'`, `string $lessThanMinMessage = '{Property} must be no less than {min}.'`, `string $greaterThanMaxMessage = '{Property} must be no greater than {max}.'`, `string $pattern = '/^\s*[-+]?\d*\.?\d+([eE][-+]?\d+)?\s*$/'`, `bool\|callable\|null $skipOnEmpty = null`, `bool $skipOnError = false`, `?Closure $when = null` | `skipOnEmpty`, `skipOnError`, `when` | `NumberHandler` |
| `TrueValue` | `Yiisoft\Validator\Rule\TrueValue` | `mixed $trueValue = '1'`, `bool $strict = false`, `string $incorrectInputMessage = 'The allowed types for {property} are integer, float, string, boolean. {type} given.'`, `string $message = '{Property} must be "{true}".'`, `bool\|callable\|null $skipOnEmpty = null`, `bool $skipOnError = false`, `?Closure $when = null` | `skipOnEmpty`, `skipOnError`, `when` | `TrueValueHandler` |

#### 3. Strict Native Type Rules (`Rule\Type\*`, for Domain Invariants)
| Rule Class | FQCN | Constructor Parameters & Defaults | Modifiers Supported | Handler Class |
|---|---|---|---|---|
| `StringType` | `Yiisoft\Validator\Rule\Type\StringType` | `string $message = '{Property} must be a string. {type} given.'`, `mixed $skipOnEmpty = null`, `bool $skipOnError = false`, `?Closure $when = null` | `skipOnEmpty`, `skipOnError`, `when` | `StringTypeHandler` |
| `IntegerType` | `Yiisoft\Validator\Rule\Type\IntegerType` | `string $message = '{Property} must be an integer.'`, `mixed $skipOnEmpty = null`, `bool $skipOnError = false`, `?Closure $when = null` | `skipOnEmpty`, `skipOnError`, `when` | `IntegerTypeHandler` |
| `FloatType` | `Yiisoft\Validator\Rule\Type\FloatType` | `string $message = '{Property} must be a float.'`, `mixed $skipOnEmpty = null`, `bool $skipOnError = false`, `?Closure $when = null` | `skipOnEmpty`, `skipOnError`, `when` | `FloatTypeHandler` |
| `BooleanType` | `Yiisoft\Validator\Rule\Type\BooleanType` | `string $message = '{Property} must be a boolean.'`, `mixed $skipOnEmpty = null`, `bool $skipOnError = false`, `?Closure $when = null` | `skipOnEmpty`, `skipOnError`, `when` | `BooleanTypeHandler` |

#### 4. String & Format Rules
| Rule Class | FQCN | Constructor Parameters & Defaults | Modifiers Supported | Handler Class |
|---|---|---|---|---|
| `Length` | `Yiisoft\Validator\Rule\Length` | `?int $exactly = null`, `?int $min = null`, `?int $max = null`, `string $incorrectInputMessage = '{Property} must be a string. {type} given.'`, `string $lessThanMinMessage = ...`, `string $greaterThanMaxMessage = ...`, `string $notExactlyMessage = ...`, `string $encoding = 'UTF-8'`, `mixed $skipOnEmpty = null`, `bool $skipOnError = false`, `?Closure $when = null` *(Named arguments `min:`, `max:`, `exactly:` required)* | `skipOnEmpty`, `skipOnError`, `when` | `LengthHandler` |
| `Email` | `Yiisoft\Validator\Rule\Email` | `string $pattern = ...`, `string $fullPattern = ...`, `string $idnEmailPattern = ...`, `bool $allowName = false`, `bool $checkDns = false`, `bool $enableIdn = false`, `string $incorrectInputMessage = ...`, `string $message = ...`, `mixed $skipOnEmpty = null`, `bool $skipOnError = false`, `?Closure $when = null` *(Use named arguments)* | `skipOnEmpty`, `skipOnError`, `when` | `EmailHandler` |
| `Regex` | `Yiisoft\Validator\Rule\Regex` | `string $pattern`, `bool $not = false`, `string $incorrectInputMessage = '{Property} must be a string. {type} given.'`, `string $message = '{Property} is invalid.'`, `mixed $skipOnEmpty = null`, `bool $skipOnError = false`, `?Closure $when = null` | `skipOnEmpty`, `skipOnError`, `when` | `RegexHandler` |
| `Url` | `Yiisoft\Validator\Rule\Url` | `string $pattern = ...`, `array $validSchemes = ['http', 'https']`, `bool $enableIdn = false`, `string $incorrectInputMessage = ...`, `string $message = ...`, `mixed $skipOnEmpty = null`, `bool $skipOnError = false`, `?Closure $when = null` *(Use named arguments)* | `skipOnEmpty`, `skipOnError`, `when` | `UrlHandler` |
| `Uuid` | `Yiisoft\Validator\Rule\Uuid` | `string $incorrectInputMessage = '{Property} must be a string. {type} given.'`, `string $message = 'The value of {property} is not a valid UUID.'`, `mixed $skipOnEmpty = null`, `bool $skipOnError = false`, `?Closure $when = null` | `skipOnEmpty`, `skipOnError`, `when` | `UuidHandler` |
| `Ip` | `Yiisoft\Validator\Rule\Ip` | `array $networks = []`, `bool $allowIpv4 = true`, `bool $allowIpv6 = true`, `bool $allowSubnet = false`, `bool $requireSubnet = false`, `bool $allowNegation = false`, `string $incorrectInputMessage = '{Property} must be a string. {type} given.'`, `string $message = '{Property} must be a valid IP address.'`, `string $ipv4NotAllowedMessage = ...`, `string $ipv6NotAllowedMessage = ...`, `string $wrongCidrMessage = ...`, `string $noSubnetMessage = ...`, `string $hasSubnetMessage = ...`, `string $notInRangeMessage = ...`, `array $ranges = []`, `mixed $skipOnEmpty = null`, `bool $skipOnError = false`, `?Closure $when = null` | `skipOnEmpty`, `skipOnError`, `when` | `IpHandler` |
| `Json` | `Yiisoft\Validator\Rule\Json` | `string $incorrectInputMessage = '{Property} must be a string. {type} given.'`, `string $message = '{Property} is not a valid JSON.'`, `mixed $skipOnEmpty = null`, `bool $skipOnError = false`, `?Closure $when = null` | `skipOnEmpty`, `skipOnError`, `when` | `JsonHandler` |

#### 5. Comparison Rules (Extend `AbstractCompare`)
> [!NOTE]
> `$skipOnEmpty` defaults to `null` in the base `Compare` rule (falling back to the validator's `defaultSkipOnEmpty`), while the shortcut rules (`Equal`, `NotEqual`, `GreaterThan`, `GreaterThanOrEqual`, `LessThan`, `LessThanOrEqual`) explicitly default it to `false`. Always use named arguments `targetProperty:`, `targetValue:`, `operator:`, `type:`.

| Rule Class | FQCN | Constructor Parameters & Defaults | Modifiers Supported | Handler Class |
|---|---|---|---|---|
| `Compare` | `Yiisoft\Validator\Rule\Compare` | `mixed $targetValue = null`, `?string $targetProperty = null`, `string $incorrectInputMessage = ...`, `string $incorrectDataSetTypeMessage = ...`, `?string $message = null`, `string $type = CompareType::NUMBER`, `string $operator = '=='`, `mixed $skipOnEmpty = null`, `bool $skipOnError = false`, `?Closure $when = null` *(Named arguments required)* | `skipOnEmpty`, `skipOnError`, `when` | `CompareHandler` |
| `Equal` | `Yiisoft\Validator\Rule\Equal` | `mixed $targetValue = null`, `?string $targetProperty = null`, `string $incorrectInputMessage = ...`, `string $incorrectDataSetTypeMessage = ...`, `?string $message = null`, `string $type = CompareType::NUMBER`, `bool $strict = false`, `mixed $skipOnEmpty = false`, `bool $skipOnError = false`, `?Closure $when = null` | `skipOnEmpty: false`, `skipOnError`, `when` | `CompareHandler` |
| `NotEqual` | `Yiisoft\Validator\Rule\NotEqual` | `mixed $targetValue = null`, `?string $targetProperty = null`, `string $incorrectInputMessage = ...`, `string $incorrectDataSetTypeMessage = ...`, `?string $message = null`, `string $type = CompareType::NUMBER`, `bool $strict = false`, `mixed $skipOnEmpty = false`, `bool $skipOnError = false`, `?Closure $when = null` | `skipOnEmpty: false`, `skipOnError`, `when` | `CompareHandler` |
| `GreaterThan` | `Yiisoft\Validator\Rule\GreaterThan` | `mixed $targetValue = null`, `?string $targetProperty = null`, `string $incorrectInputMessage = ...`, `string $incorrectDataSetTypeMessage = ...`, `?string $message = null`, `string $type = CompareType::NUMBER`, `mixed $skipOnEmpty = false`, `bool $skipOnError = false`, `?Closure $when = null` | `skipOnEmpty: false`, `skipOnError`, `when` | `CompareHandler` |
| `GreaterThanOrEqual` | `Yiisoft\Validator\Rule\GreaterThanOrEqual` | `mixed $targetValue = null`, `?string $targetProperty = null`, `string $incorrectInputMessage = ...`, `string $incorrectDataSetTypeMessage = ...`, `?string $message = null`, `string $type = CompareType::NUMBER`, `mixed $skipOnEmpty = false`, `bool $skipOnError = false`, `?Closure $when = null` | `skipOnEmpty: false`, `skipOnError`, `when` | `CompareHandler` |
| `LessThan` | `Yiisoft\Validator\Rule\LessThan` | `mixed $targetValue = null`, `?string $targetProperty = null`, `string $incorrectInputMessage = ...`, `string $incorrectDataSetTypeMessage = ...`, `?string $message = null`, `string $type = CompareType::NUMBER`, `mixed $skipOnEmpty = false`, `bool $skipOnError = false`, `?Closure $when = null` | `skipOnEmpty: false`, `skipOnError`, `when` | `CompareHandler` |
| `LessThanOrEqual` | `Yiisoft\Validator\Rule\LessThanOrEqual` | `mixed $targetValue = null`, `?string $targetProperty = null`, `string $incorrectInputMessage = ...`, `string $incorrectDataSetTypeMessage = ...`, `?string $message = null`, `string $type = CompareType::NUMBER`, `mixed $skipOnEmpty = false`, `bool $skipOnError = false`, `?Closure $when = null` | `skipOnEmpty: false`, `skipOnError`, `when` | `CompareHandler` |

#### 6. Collections & Iteration Rules
| Rule Class | FQCN | Constructor Parameters & Defaults | Modifiers Supported | Handler Class |
|---|---|---|---|---|
| `Count` | `Yiisoft\Validator\Rule\Count` | `?int $exactly = null`, `?int $min = null`, `?int $max = null`, `string $incorrectInputMessage = ...`, `string $lessThanMinMessage = ...`, `string $greaterThanMaxMessage = ...`, `string $notExactlyMessage = ...`, `mixed $skipOnEmpty = null`, `bool $skipOnError = false`, `?Closure $when = null` *(Named arguments `min:`, `max:`, `exactly:` required)* | `skipOnEmpty`, `skipOnError`, `when` | `CountHandler` |
| `Each` | `Yiisoft\Validator\Rule\Each` | `callable\|iterable\|object\|string $rules = []`, `string $incorrectInputMessage = ...`, `string $incorrectInputKeyMessage = ...`, `mixed $skipOnEmpty = null`, `bool $skipOnError = false`, `?Closure $when = null`, `bool $stopOnError = false` *(Note: `$stopOnError` is parameter #7; use named `stopOnError: true`)* | `skipOnEmpty`, `skipOnError`, `when` | `EachHandler` |
| `In` | `Yiisoft\Validator\Rule\In` | `iterable $values`, `bool $strict = false`, `bool $not = false`, `string $message = '{Property} is not in the list of acceptable values.'`, `mixed $skipOnEmpty = null`, `bool $skipOnError = false`, `?Closure $when = null` | `skipOnEmpty`, `skipOnError`, `when` | `InHandler` |
| `InEnum` | `Yiisoft\Validator\Rule\InEnum` | `class-string<UnitEnum> $class`, `bool $useNames = false`, `bool $strict = false`, `bool $not = false`, `string $message = '{Property} is not in the list of acceptable values.'`, `mixed $skipOnEmpty = null`, `bool $skipOnError = false`, `?Closure $when = null` | `skipOnEmpty`, `skipOnError`, `when` | `InEnumHandler` |
| `Subset` | `Yiisoft\Validator\Rule\Subset` | `iterable $values`, `bool $strict = false`, `string $incorrectInputMessage = '{Property} must be iterable. {type} given.'`, `string $message = '{Property} is not a subset of acceptable values.'`, `mixed $skipOnEmpty = null`, `bool $skipOnError = false`, `?Closure $when = null` | `skipOnEmpty`, `skipOnError`, `when` | `SubsetHandler` |
| `UniqueIterable` | `Yiisoft\Validator\Rule\UniqueIterable` | `string $incorrectInputMessage = '{Property} must be array or iterable.'`, `string $incorrectItemValueMessage = ...`, `string $differentTypesMessage = 'All iterable items of {property} must have the same type.'`, `string $message = 'Every iterable\'s item of {property} must be unique.'`, `mixed $skipOnEmpty = null`, `bool $skipOnError = false`, `?Closure $when = null` | `skipOnEmpty`, `skipOnError`, `when` | `UniqueIterableHandler` |

#### 7. Structural & Flow Combinator Rules
| Rule Class | FQCN | Constructor Parameters & Defaults | Modifiers Supported | Handler Class |
|---|---|---|---|---|
| `Nested` | `Yiisoft\Validator\Rule\Nested` | `iterable\|object\|string\|null $rules = null`, `int $validatedObjectPropertyVisibility = ...`, `int $rulesSourceClassPropertyVisibility = ...`, `string $noRulesWithNoObjectMessage = ...`, `string $incorrectDataSetTypeMessage = ...`, `string $incorrectInputMessage = ...`, `bool $requirePropertyPath = false`, `string $noPropertyPathMessage = ...`, `bool $handleEachShortcut = true`, `bool $propagateOptions = false`, `mixed $skipOnEmpty = null`, `bool $skipOnError = false`, `?Closure $when = null` *(Named arguments required)* | `skipOnEmpty`, `skipOnError`, `when` | `NestedHandler` |
| `Composite` | `Yiisoft\Validator\Rule\Composite` | `iterable $rules = []`, `mixed $skipOnEmpty = null`, `bool $skipOnError = false`, `?Closure $when = null` | `skipOnEmpty`, `skipOnError`, `when` | `CompositeHandler` |
| `StopOnError` | `Yiisoft\Validator\Rule\StopOnError` | `iterable $rules` (no default — `new StopOnError()` is a fatal `ArgumentCountError`), `mixed $skipOnEmpty = null`, `bool $skipOnError = false`, `?Closure $when = null` | `skipOnEmpty`, `skipOnError`, `when` | `StopOnErrorHandler` |
| `AnyRule` | `Yiisoft\Validator\Rule\AnyRule` | `iterable $rules` (no default — `new AnyRule()` is a fatal `ArgumentCountError`), `string $message = 'At least one of the inner rules must pass the validation.'`, `mixed $skipOnEmpty = null`, `bool $skipOnError = false`, `?Closure $when = null` | `skipOnEmpty`, `skipOnError`, `when` | `AnyRuleHandler` |

#### 8. Cross-Property Cardinality Rules
| Rule Class | FQCN | Constructor Parameters & Defaults | Modifiers Supported | Handler Class |
|---|---|---|---|---|
| `FilledAtLeast` | `Yiisoft\Validator\Rule\FilledAtLeast` | `array $properties`, `int $min = 1`, `string $incorrectInputMessage = '{Property} must be an array or an object. {type} given.'`, `string $message = 'At least {min, number} {min, plural, one{property} other{properties}} from this list must be filled for {property}: {properties}.'`, `mixed $skipOnEmpty = null`, `bool $skipOnError = false`, `?Closure $when = null` | `skipOnEmpty`, `skipOnError`, `when` | `FilledAtLeastHandler` |
| `FilledOnlyOneOf` | `Yiisoft\Validator\Rule\FilledOnlyOneOf` | `array $properties`, `string $incorrectInputMessage = '{Property} must be an array or an object. {type} given.'`, `string $message = 'Exactly 1 property from this list must be filled for {property}: {properties}.'`, `mixed $skipOnEmpty = null`, `bool $skipOnError = false`, `?Closure $when = null` | `skipOnEmpty`, `skipOnError`, `when` | `FilledOnlyOneOfHandler` |

#### 9. Date Rules (`Rule\Date\*`)
| Rule Class | FQCN | Constructor Parameters & Defaults | Modifiers Supported | Handler Class |
|---|---|---|---|---|
| `Date` | `Yiisoft\Validator\Rule\Date\Date` | `?string $format = null`, `?int $dateType = null`, `?string $timeZone = null`, `?string $locale = null`, `int\|string\|DateTimeInterface\|null $min = null`, `int\|string\|DateTimeInterface\|null $max = null`, `?string $messageFormat = null`, `?int $messageDateType = null`, `?string $incorrectInputMessage = null`, `?string $tooEarlyMessage = null`, `?string $tooLateMessage = null`, `mixed $skipOnEmpty = null`, `bool $skipOnError = false`, `?Closure $when = null` *(Named arguments required)* | `skipOnEmpty`, `skipOnError`, `when` | `Date\DateHandler` |
| `DateTime` | `Yiisoft\Validator\Rule\Date\DateTime` | `?string $format = null`, `?int $dateType = null`, `?int $timeType = null`, `?string $timeZone = null`, `?string $locale = null`, `int\|string\|DateTimeInterface\|null $min = null`, `int\|string\|DateTimeInterface\|null $max = null`, `?string $messageFormat = null`, `?int $messageDateType = null`, `?int $messageTimeType = null`, `?string $incorrectInputMessage = null`, `?string $tooEarlyMessage = null`, `?string $tooLateMessage = null`, `mixed $skipOnEmpty = null`, `bool $skipOnError = false`, `?Closure $when = null` *(Named arguments required)* | `skipOnEmpty`, `skipOnError`, `when` | `Date\DateTimeHandler` |
| `Time` | `Yiisoft\Validator\Rule\Date\Time` | `?string $format = null`, `?int $timeType = null`, `?string $timeZone = null`, `?string $locale = null`, `int\|string\|DateTimeInterface\|null $min = null`, `int\|string\|DateTimeInterface\|null $max = null`, `?string $messageFormat = null`, `?int $messageTimeType = null`, `?string $incorrectInputMessage = null`, `?string $tooEarlyMessage = null`, `?string $tooLateMessage = null`, `mixed $skipOnEmpty = null`, `bool $skipOnError = false`, `?Closure $when = null` *(Named arguments required)* | `skipOnEmpty`, `skipOnError`, `when` | `Date\TimeHandler` |

#### 10. File & Image Rules
| Rule Class | FQCN | Constructor Parameters & Defaults | Modifiers Supported | Handler Class |
|---|---|---|---|---|
| `File` | `Yiisoft\Validator\Rule\File` | `array\|string\|null $extensions = null`, `array\|string\|null $mimeTypes = null`, `?int $size = null`, `?int $minSize = null`, `?int $maxSize = null`, `bool $trustClientMediaType = false`, `mixed $skipOnEmpty = null`, `bool $skipOnError = false`, `?Closure $when = null` | `skipOnEmpty`, `skipOnError`, `when` | `FileHandler` |
| `Image` | `Yiisoft\Validator\Rule\Image\Image` | `?int $width = null`, `?int $height = null`, `?int $minWidth = null`, `?int $minHeight = null`, `?int $maxWidth = null`, `?int $maxHeight = null`, `?ImageAspectRatio $aspectRatio = null`, `string $notImageMessage = ...` *(7 more message parameters follow; 8 message parameters total precede `$skipOnEmpty`)*, `mixed $skipOnEmpty = null`, `bool $skipOnError = false`, `?Closure $when = null` *(Named arguments required)* | `skipOnEmpty`, `skipOnError`, `when` | `Image\ImageHandler` |
| `ImageAspectRatio` | `Yiisoft\Validator\Rule\Image\ImageAspectRatio` | `int $width`, `int $height`, `float $margin = 0` | Value object companion | Evaluated by `ImageHandler` |

> [!TIP]
> **`File` Rule Deep-Dive:**
> For the complete `File` constructor (including all message parameters), size/exclusivity and upload-error traps, the `trustClientMediaType` warning, and string-keyed validation-call semantics, see [§5.1](http-validation-advanced.md#51-file-rule--safe-post-validation-storage).

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
   - Behavior: Enforces native PHP types via `is_string()`, `is_int()`, `is_float()`, `is_bool()`. Passing `"42"` to `IntegerType` immediately fails with `"{Property} must be an integer."`.
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
- `true`: skips validation if the value is empty per `WhenEmpty` — `null`, empty string `""`, any empty iterable (including `[]`), or the property was not passed at all.
- `callable`: a custom empty condition. Yii 3 ships four built-in condition classes in `Yiisoft\Validator\EmptyCondition\*`:
  - `WhenEmpty`: the condition behind `true` — treats `null`, `""`, any empty iterable, and a property missing from the dataset as empty.
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
use Yiisoft\Validator\ValidationContext;

final class DeliveryOptionsDto
{
    public bool $isPickup = false;
    public ?string $shippingAddress = null;

    public static function isShippingRequired(mixed $value, ValidationContext $context): bool
    {
        return $context->getDataSet()->getPropertyValue('isPickup') === false;
    }
}
```

> [!IMPORTANT]
> **No closures inside attributes.** Attribute arguments must be compile-time constant expressions —
> `#[Required(when: static fn (...) => ...)]` is a fatal compile error. Attach `when` to rule **instances**
> (e.g. via array rules), the way the package tests and docs do:

```php
// Required only when pickup is disabled
$rules = [
    'shippingAddress' => [
        new Required(
            when: static fn (mixed $value, ValidationContext $context): bool
                => DeliveryOptionsDto::isShippingRequired($value, $context),
        ),
    ],
];
$result = $validator->validate(new DeliveryOptionsDto(), $rules);
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
