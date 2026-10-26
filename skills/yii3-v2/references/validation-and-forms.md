# Yii3 Validation & Forms Guide

> Practical guide for input validation with `yiisoft/validator`, typed DTO hydration with `yiisoft/hydrator` and
> `yiisoft/hydrator-validator`, HTML form models with `yiisoft/form-model`, and PSR-7 request mapping with
> `yiisoft/input-http`.

---

## Table of Contents
- [1. Package Map: Who Does What](#1-package-map-who-does-what)
- [2. Core Validation API (`yiisoft/validator`)](#2-core-validation-api-yiisoftvalidator)
  - [2.1. ValidatorInterface](#21-validatorinterface)
  - [2.2. Inspecting the Result](#22-inspecting-the-result)
  - [2.3. Built-In Rules Catalog](#23-built-in-rules-catalog)
- [3. Declaring Rules](#3-declaring-rules)
  - [3.1. PHP Attributes](#31-php-attributes)
  - [3.2. Rules Without Attributes](#32-rules-without-attributes)
  - [3.3. Rule Behavior Modifiers](#33-rule-behavior-modifiers)
- [4. Custom Rules](#4-custom-rules)
- [5. Messages, Labels & Translation](#5-messages-labels--translation)
- [6. Form Models (`yiisoft/form-model`)](#6-form-models-yiisoftform-model)
  - [6.1. FormModel Base Class](#61-formmodel-base-class)
  - [6.2. FormHydrator: Populate & Validate](#62-formhydrator-populate--validate)
  - [6.3. Full Web Form Example](#63-full-web-form-example)
- [7. Typed DTO Hydration (`yiisoft/hydrator`, `yiisoft/hydrator-validator`)](#7-typed-dto-hydration-yiisofthydrator-yiisofthydrator-validator)
- [8. HTTP Request Inputs (`yiisoft/input-http`)](#8-http-request-inputs-yiisoftinput-http)
- [9. Choosing the Right Tool](#9-choosing-the-right-tool)
- [10. Anti-Pattern Matrix](#10-anti-pattern-matrix)
- [11. Related Topic Guides](#11-related-topic-guides)

---

## 1. Package Map: Who Does What

Five small packages cooperate; each has a single responsibility. Install only what the feature uses
(see [Dependency Protocol](dependency-protocol.md)).

| Package | Role | Key entry points |
|---|---|---|
| `yiisoft/validator` | Rule definitions, rule handlers, validation engine, `Result`/`Error` value objects | `ValidatorInterface`, `Rule\*` classes |
| `yiisoft/hydrator` | Creates and populates typed objects from arrays with type casting, mapping, and DI-resolved dependencies | `HydratorInterface::create()`, `hydrate()` |
| `yiisoft/hydrator-validator` | Decorator that hydrates **and** validates in one call; stores the `Result` on the object | `ValidatingHydrator`, `ValidatedInputInterface` |
| `yiisoft/form-model` | Base class + hydration helpers for HTML form models (labels, hints, placeholders) | `FormModel`, `FormHydrator` |
| `yiisoft/input-http` | Maps PSR-7 request data to input DTOs via attributes; plugs into middleware-dispatcher | `AbstractInput`, `#[FromBody]`, `RequestInputParametersResolver` |

> [!IMPORTANT]
> To parse JSON request bodies (`application/json`), the PSR-15 middleware `Yiisoft\Request\Body\RequestBodyParser`
> from `yiisoft/request-body-parser` must be in the middleware pipeline before the action. Otherwise
> `$request->getParsedBody()` returns `null` for JSON payloads. See [PSR-15 Middlewares Guide](middlewares.md).

---

## 2. Core Validation API (`yiisoft/validator`)

### 2.1. ValidatorInterface

The single method of the interface (verbatim from `src/ValidatorInterface.php`):

```php
public function validate(
    mixed $data,
    callable|iterable|object|string|null $rules = null,
    ?ValidationContext $context = null,
): Result;
```

- Inject `Yiisoft\Validator\ValidatorInterface` — never instantiate `Yiisoft\Validator\Validator` by hand in application code.
- `$data` accepts: a plain value, an array, an object (DTO/FormModel), a `DataSetInterface`, or a `RulesProviderInterface` object (its `getRules()` is used when `$rules` is `null`).
- `$rules`, when passed, has priority over rules attached to `$data` itself (attributes or `getRules()`).

### 2.2. Inspecting the Result

`Yiisoft\Validator\Result` is an immutable value object. Key inspection methods:

| Method | Returns |
|---|---|
| `isValid(): bool` | `true` when there are no errors |
| `isPropertyValid(string $property): bool` | per-property validity |
| `getErrors(): array` | list of `Yiisoft\Validator\Error` objects |
| `getErrorMessages(): array` | flat list of message strings |
| `getErrorMessagesIndexedByPath(string $separator = '.', ?string $escape = '.'): array` | `['title' => ['Title cannot be blank.']]` |
| `getFirstErrorMessagesIndexedByPath(string $separator = '.', ?string $escape = '.'): array` | `['title' => 'Title cannot be blank.']` |
| `getErrorMessagesIndexedByProperty(): array` / `getFirstErrorMessagesIndexedByProperty(): array` | same, indexed by property name |
| `getPropertyErrorMessages(string $property): array` | messages of a single property |

For API responses, `getErrorMessagesIndexedByPath()` is the standard shape; for form re-rendering,
`getFirstErrorMessagesIndexedByProperty()` matches one error per input field.

`Yiisoft\Validator\Error` exposes `getMessage(): string`, `getParameters(): array`, and
`getValuePath(?string $escape = null): array`.

```php
$result = $this->validator->validate($dto);
if (!$result->isValid()) {
    return $this->responseFactory->createResponse([
        'status' => 'error',
        'errors' => $result->getErrorMessagesIndexedByPath(),
    ], Status::UNPROCESSABLE_ENTITY);
}
```

### 2.3. Built-In Rules Catalog

All rule classes live in `Yiisoft\Validator\Rule\` and are PHP attributes marked `IS_REPEATABLE` (verified against
`src/Rule/`). Exact class names in the current version — there is **no** `HasLength`, `NumberValue`, or `IsString`
(those are Yii 2 / older draft names):

| Group | Rules |
|---|---|
| Requiredness | `Required` |
| Lenient type & format | `StringValue`, `BooleanValue`, `Integer`, `Number` |
| Strict native types (`Rule\Type\`) | `StringType`, `IntegerType`, `FloatType`, `BooleanType` |
| Strings | `Length`, `Email`, `Regex`, `Json`, `Url`, `Uuid`, `Ip` |
| Numbers | `Integer`, `Number` (min/max, pattern) |
| Comparison (extend `AbstractCompare`) | `Equal`, `NotEqual`, `GreaterThan`, `GreaterThanOrEqual`, `LessThan`, `LessThanOrEqual`, `Compare` (with `CompareType`) |
| Collections | `Count`, `Each`, `Subset`, `In`, `InEnum`, `UniqueIterable` |
| Structure | `Nested`, `Composite`, `StopOnError`, `AnyRule` |
| Cross-property | `FilledAtLeast`, `FilledOnlyOneOf` |
| Dates (`Rule\Date\`) | `Date`, `DateTime`, `Time` |
| Files (`Rule\Image\`) | `File` (extension, MIME, size), `Image` (dimensions), `ImageAspectRatio` |
| Misc | `Callback`, `TrueValue` |

Representative constructors (named arguments; every rule also accepts `skipOnEmpty`, `skipOnError`, `when`):

```php
new Required()                                            // '{Property} cannot be blank.'
new Length(min: 3, max: 255)                              // or exactly: 10; encoding: 'UTF-8'
new Integer(min: 1, max: 100)                             // validates integer strings/ints against range
new Number(min: 0.5)                                      // floats/numeric strings
new Regex(pattern: '/^[a-z0-9-]+$/')
new Email()                                               // checkDns: true adds DNS-level checks
new Count(min: 1, max: 5)                                 // arrays / Countable
new Each([new StringValue(), new Length(max: 100)])       // rules per collection element
new In(values: ['draft', 'published'])
new InEnum(class: StatusEnum::class)                      // backing enum values
new Nested([new Required(), new Length(max: 255)])        // nested structure/object
```

Two rule layers for type checking — pick deliberately:

- **Lenient rules** (`StringValue`, `Integer`, `Number`, `BooleanValue`) accept compatible scalar input (e.g.
  `"123"` passes `Integer`) and cast internally. Use them for **HTTP input**, which always arrives as strings.
- **Strict type rules** (`Rule\Type\StringType`, `IntegerType`, `FloatType`, `BooleanType`) require the exact native
  PHP type. Use them for **internal domain data** that is already typed.

`Required` must come first when combined with other rules on the same property; without it, empty values are skipped
by the other rules (see §3.3).

---

## 3. Declaring Rules

### 3.1. PHP Attributes

Attributes are repeatable: stacking several on one property accumulates rules (all are
`#[Attribute(..., Attribute::IS_REPEATABLE)]`).

```php
declare(strict_types=1);

namespace App\Application\Post;

use Yiisoft\Validator\Rule\Length;
use Yiisoft\Validator\Rule\Required;
use Yiisoft\Validator\Rule\StringValue;

final class CreatePostDto
{
    #[Required]
    #[StringValue]
    #[Length(min: 3, max: 255)]
    public string $title = '';

    #[Required]
    #[Each([new StringValue(), new Length(max: 100)])]
    public array $tags = [];
}
```

Attributes are extracted by `Yiisoft\Validator\RulesProvider\AttributesRulesProvider`; the validator does this
automatically when you pass a class-string or an object with attributes.

### 3.2. Rules Without Attributes

`validate($data, $rules)` accepts several rule sources (normalized by `Yiisoft\Validator\Helper\RulesNormalizer`):

```php
// 1. Plain map: property => list of rules
$result = $this->validator->validate($data, [
    'title' => [new Required(), new Length(min: 3, max: 255)],
    'tags'  => [new Each([new StringValue()])],
]);

// 2. Class-string: rules taken from the class's attributes
$result = $this->validator->validate($array, CreatePostDto::class);

// 3. Object implementing RulesProviderInterface
//    public function getRules(): iterable;
$result = $this->validator->validate($data, new PostRulesProvider());

// 4. A bare callable is wrapped into a Callback rule
$result = $this->validator->validate($value, static fn (mixed $value): Result => /* ... */);
```

Use plain maps for one-off ad-hoc validation (e.g. validating a decoded JSON blob inside a use case); use attributes
on DTOs and form models — they keep rules next to the data they guard.

### 3.3. Rule Behavior Modifiers

Every rule supports three modifiers (verified: `SkipOnEmptyInterface`, `SkipOnErrorInterface`, `WhenInterface` +
traits in `src/Rule/Trait/`):

| Modifier | Semantics |
|---|---|
| `skipOnEmpty: bool\|callable\|null` | `null` → validator's global default; `false` → never skip; `true` → skip when value is not passed / `null` / `""` / empty iterable; callable → skip when it returns `true`. Named empty conditions also ship as classes: `Yiisoft\Validator\EmptyCondition\NeverEmpty`, `WhenEmpty`, `WhenMissing`, `WhenNull`. |
| `skipOnError: bool` | skip this rule when a previous rule on the same property already failed (avoids cascading noise) |
| `when: ?Closure` | run the rule only if the closure returns `true`: `fn (mixed $value, ValidationContext $context): bool` |

```php
// Only validate the URL when the source is external
#[Url(when: static fn (mixed $value, ValidationContext $context): bool => $context->getParameter('isExternal') === true)]
public ?string $externalUrl = null;

// Required only when another field is missing — treat "missing" and "empty" distinctly
#[Required(emptyCondition: new WhenMissing())]
public ?string $optionalId = null;
```

> [!NOTE]
> The distinction matters in APIs: `Required` with the default `WhenEmpty`-style semantics fails on `""` and `null`
> alike. Use `new WhenMissing()` when a field must be present in the payload but is allowed to be empty.

Structural combinators control rule-group flow: `StopOnError([...])` stops the group at the first failing rule;
`AnyRule([...])` succeeds at the first passing rule; `Composite([...], skipOnEmpty: ..., when: ...)` shares
modifiers across the group.

---

## 4. Custom Rules

A custom rule is a pair: an immutable rule class implementing `Yiisoft\Validator\RuleInterface` and a handler
implementing `Yiisoft\Validator\RuleHandlerInterface`. Exact contract (from `src/RuleInterface.php` and
`src/RuleHandlerInterface.php`):

```php
// Rule: value object carrying options; returns the handler
public function getHandler(): string|RuleHandlerInterface;

// Handler: performs the check
public function validate(mixed $value, RuleInterface $rule, ValidationContext $context): Result;
```

The handler must throw `Yiisoft\Validator\Exception\UnexpectedRuleException` when the passed rule is not its own type.
Follow the handler idiom used by all built-in handlers (`src/Rule/RegexHandler.php`): create `new Result()`, call
`$result->addError($message, $parameters)` (it returns the `Result`), and pass translated property placeholders.

```php
declare(strict_types=1);

namespace App\Application\Shared\Validator\Rule;

use Yiisoft\Validator\Exception\UnexpectedRuleException;
use Yiisoft\Validator\Result;
use Yiisoft\Validator\RuleHandlerInterface;
use Yiisoft\Validator\RuleInterface;
use Yiisoft\Validator\ValidationContext;

use function is_string;

final readonly class HexColor implements RuleInterface
{
    public function __construct(
        private string $message = 'Value must be a hexadecimal color like #RRGGBB.',
    ) {}

    public function getMessage(): string
    {
        return $this->message;
    }

    public function getHandler(): string|RuleHandlerInterface
    {
        return HexColorHandler::class;
    }
}

final class HexColorHandler implements RuleHandlerInterface
{
    public function validate(mixed $value, RuleInterface $rule, ValidationContext $context): Result
    {
        if (!$rule instanceof HexColor) {
            throw new UnexpectedRuleException(HexColor::class, $rule);
        }

        $result = new Result();
        if (is_string($value) && preg_match('/^#[0-9a-fA-F]{6}$/', $value) === 1) {
            return $result;
        }

        return $result->addError($rule->getMessage(), [
            'property' => $context->getTranslatedProperty(),
            'Property' => $context->getCapitalizedTranslatedProperty(),
            'value'    => is_scalar($value) ? $value : get_debug_type($value),
        ]);
    }
}
```

Usage — as an attribute (add `#[\Attribute(\Attribute::TARGET_PROPERTY | \Attribute::IS_REPEATABLE)]` on
`HexColor` if used declaratively) or inline:

```php
#[HexColor()]
public string $brandColor = '#000000';

$result = $this->validator->validate($dto, ['brandColor' => [new HexColor()]]);
```

> [!TIP]
> For one-off checks a `Callback` rule is enough — introduce a full rule/handler pair only when the constraint is
> reused across DTOs or needs options.

---

## 5. Messages, Labels & Translation

- Every rule constructor accepts message parameters (`message:`, `lessThanMinMessage:`, …). Placeholders are
  brace-style: `{Property}`, `{min}`, `{max}`, `{value}`, `{type}`. Placeholders are filled from the parameters array
  the handler passes to `addError()` — property names come from the validation context
  (`$context->getTranslatedProperty()` / `getCapitalizedTranslatedProperty()`).
- Messages are translated by default (`Error::MESSAGE_TRANSLATE` is the default message-processing mode). The
  validator uses `Yiisoft\Translator\TranslatorInterface` with the default category **`'yii-validator'`**
  (`Validator::DEFAULT_TRANSLATION_CATEGORY`, `src/Validator.php`). The category ships translations for built-in
  messages (e.g. `messages/ru/yii-validator.php`).
- Property labels for `{Property}` substitution come from the `#[\Yiisoft\Validator\Label('...')]` attribute on
  properties, or from a `PropertyTranslatorInterface` / `PropertyTranslatorProviderInterface` implementation passed
  to the validator.

```php
#[Required(message: '{Property} must be provided.')]
#[Label('Publication title')]
public string $title = '';
```

> [!NOTE]
> `Error::MESSAGE_NONE` / `addErrorWithFormatOnly()` / `addErrorWithoutPostProcessing()` exist for custom handlers
> that must bypass translation or formatting; normal application code keeps the default.

---

## 6. Form Models (`yiisoft/form-model`)

### 6.1. FormModel Base Class

`Yiisoft\FormModel\FormModel` is the abstract base for HTML form models. Public API comes from
`FormModelInterface` (verified — there is **no** `isPropertyRequired()` or `getAttributeValue()` method):

| Method | Purpose |
|---|---|
| `getFormName(): string` | short class name by default; used as the scope key in POST payloads (`ContactForm[email]`) |
| `hasProperty(string $property): bool` | property existence |
| `getPropertyValue(string $property): mixed` | current value |
| `getPropertyLabel(string $property): string` / `getPropertyLabels(): array` | labels (auto-generated from property names, or from `#[Label]`) |
| `getPropertyHint(...)` / `getPropertyPlaceholder(...)` | hints and placeholders from `#[Hint]` / `#[Placeholder]` attributes |
| `isValid(): bool` / `isValidated(): bool` | validation state |
| `getValidationResult(): Result` | throws `LogicException` when not yet validated |
| `addError(string $message, array $valuePath = []): static` | manual error (e.g. from a use-case failure) |

The validator calls `processValidationResult(Result)` on the model automatically (the class implements
`PostValidationHookInterface`), so `populateAndValidate()` leaves the model fully introspectable — no manual
result plumbing in the action.

### 6.2. FormHydrator: Populate & Validate

`Yiisoft\FormModel\FormHydrator` combines hydration and validation. Exact methods (from `src/FormHydrator.php`):

```php
public function __construct(HydratorInterface $hydrator, ValidatorInterface $validator) {}

public function populate(FormModelInterface $model, mixed $data, ?array $map = null,
    ?bool $strict = null, ?string $scope = null): bool;
public function validate(FormModelInterface $model): Result;
public function populateAndValidate(FormModelInterface $model, mixed $data, ?array $map = null,
    ?bool $strict = null, ?string $scope = null): bool;

public function populateFromGet(FormModelInterface $model, ServerRequestInterface $request, /* same tail */): bool;
public function populateFromPost(FormModelInterface $model, ServerRequestInterface $request, /* same tail */): bool;
public function populateFromGetAndValidate(...): bool;
public function populateFromPostAndValidate(...): bool;
```

Semantics of the tail arguments (`$map`, `$strict`, `$scope`):

| Argument | Meaning |
|---|---|
| `$map` | explicit map of model property names → keys in the data array |
| `$strict` | `false` → fill everything present in the data; `null` (default) → fill only properties that have validation rules (mass-assignment protection via `#[Safe]`); `true` → strict mapping only |
| `$scope` | key of the payload to read from (`ContactForm`); defaults to `getFormName()`, `''` reads the whole payload |

`populate*()` methods return `bool` (whether filling succeeded — e.g. `false` when the scope key is absent);
`populate*AndValidate()` return `bool` = filled **and** valid.

The `#[\Yiisoft\FormModel\Attribute\Safe]` attribute marks a property fillable: only properties that carry
validation rules (or `#[Safe]`) are filled in default (`$strict = null`) mode. A property with no rules and no
`#[Safe]` is **never** filled from user input — this is the mass-assignment guard.

### 6.3. Full Web Form Example

```php
declare(strict_types=1);

namespace App\Presentation\Web\Contact\Form;

use Yiisoft\FormModel\FormModel;
use Yiisoft\Validator\Rule\Email;
use Yiisoft\Validator\Rule\Length;
use Yiisoft\Validator\Rule\Required;

final class ContactForm extends FormModel
{
    #[Label('Your name')]
    #[Required]
    #[Length(min: 2, max: 100)]
    public string $name = '';

    #[Required]
    #[Email]
    public string $email = '';

    #[Hint('We never share your address.')]
    #[Required]
    #[Length(min: 10, max: 2000)]
    public string $message = '';
}
```

```php
declare(strict_types=1);

namespace App\Presentation\Web\Contact;

use App\Presentation\Web\Contact\Form\ContactForm;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Yiisoft\FormModel\FormHydrator;
use Yiisoft\Yii\View\Renderer\ViewRenderer;

final readonly class ContactAction
{
    public function __construct(
        private ViewRenderer $viewRenderer,
        private FormHydrator $formHydrator,
        private ContactUseCase $useCase,
    ) {}

    public function __invoke(ServerRequestInterface $request): ResponseInterface
    {
        $form = new ContactForm();

        if ($request->getMethod() === 'POST') {
            if ($this->formHydrator->populateFromPostAndValidate($form, $request)) {
                $this->useCase->handle($form->name, $form->email, $form->message);
                return $this->viewRenderer->render('contact/success');
            }
        }

        // Re-render with errors: template reads $form->getValidationResult()
        // and $form->getPropertyLabel('name') for <label> texts.
        return $this->viewRenderer->render('contact/form', ['form' => $form]);
    }
}
```

DI: `yiisoft/form-model` ships `config/di.php` defining `FormHydrator` with a dedicated `Hydrator` whose type
caster chain is `NullTypeCaster(emptyString: true)` → `PhpNativeTypeCaster` → `NonArrayTypeCaster` →
`HydratorTypeCaster` (empty strings cast to `null` for nullable properties). Use the package defaults; do not
redefine `FormHydrator` unless you must.

---

## 7. Typed DTO Hydration (`yiisoft/hydrator`, `yiisoft/hydrator-validator`)

`Yiisoft\Hydrator\HydratorInterface` (from `src/HydratorInterface.php`):

```php
public function hydrate(object $object, array|DataInterface $data = []): void;
public function create(string $class, array|DataInterface $data = []): object;
```

`Hydrator` casts raw values to declared property types (with the type caster chain above), supports property/argument
mapping, and resolves `Parameter` attributes (see `src/Attribute/Parameter/`): `#[Di]` (pull a dependency from the
container), `#[Data('key')]`, `#[ToDateTime]`, `#[ToString]`, `#[ToArrayOfStrings]`, `#[Trim]`, `#[Collection]`,
among others. Use these on constructor parameters or promoted properties of DTOs.

`yiisoft/hydrator-validator` adds validation to hydration. Its complete public surface (three classes + one
attribute, verified in `src/`):

| Symbol | Role |
|---|---|
| `ValidatingHydrator` | `final` decorator implementing `HydratorInterface`; validates raw data before hydration and the hydrated object after it |
| `ValidatedInputInterface` | extends `PostValidationHookInterface`; adds `getValidationResult(): Result` |
| `ValidatedInputTrait` | implements `processValidationResult(Result)` + `getValidationResult()` |
| `#[Validate(RuleInterface ...$rules)]` | attaches rules to a property/parameter during hydration |

```php
declare(strict_types=1);

namespace App\Application\Post;

use Yiisoft\Hydrator\Validator\ValidatedInputInterface;
use Yiisoft\Hydrator\Validator\ValidatedInputTrait;
use Yiisoft\Validator\Rule\Length;
use Yiisoft\Validator\Rule\Required;
use Yiisoft\Validator\Rule\StringValue;

final class CreatePostInput implements ValidatedInputInterface
{
    use ValidatedInputTrait;

    #[Required]
    #[StringValue]
    #[Length(min: 3, max: 255)]
    public string $title = '';
}
```

```php
// In a use case or action — one call hydrates AND validates:
/** @var CreatePostInput $input */
$input = $this->validatingHydrator->create(CreatePostInput::class, $data);
if (!$input->getValidationResult()->isValid()) { /* ... */ }
```

DI: map `Yiisoft\Hydrator\HydratorInterface::class => ValidatingHydrator::class` (or inject
`ValidatingHydrator` directly). `yiisoft/input-http`'s shipped configuration already wires
`RequestInputParametersResolver` to `ValidatingHydrator` — see §8.

---

## 8. HTTP Request Inputs (`yiisoft/input-http`)

`yiisoft/input-http` maps PSR-7 request data to input DTOs injected directly into action signatures.

**Data attributes** (class-level, on the DTO; verified — only two exist):

| Attribute | Constructor | Source |
|---|---|---|
| `#[FromBody]` | `__construct(string\|array\|null $name = null, array $map = [], bool $strict = false)` | `$request->getParsedBody()`; `$name = null` → whole payload, string/array → sub-path |
| `#[FromQuery]` | same signature | `$request->getQueryParams()` |

**Parameter attributes** (property/argument-level; `Yiisoft\Input\Http\Attribute\Parameter\`): `#[Body('name')]`,
`#[Query('id')]`, `#[Request('headerName')]`, `#[UploadedFiles]` — pull a single value from the respective part of the
request.

**The input DTO** extends `Yiisoft\Input\Http\AbstractInput` (which implements `RequestInputInterface` +
`ValidatedInputInterface` via `ValidatedInputTrait`):

```php
declare(strict_types=1);

namespace App\Presentation\Action\Post\Input;

use Yiisoft\Input\Http\AbstractInput;
use Yiisoft\Input\Http\Attribute\Data\FromBody;
use Yiisoft\Validator\Rule\Length;
use Yiisoft\Validator\Rule\Required;
use Yiisoft\Validator\Rule\StringValue;

#[FromBody]
final class CreatePostInput extends AbstractInput
{
    #[Required]
    #[StringValue]
    #[Length(min: 3, max: 255)]
    public string $title = '';
}
```

**Wiring.** `RequestInputParametersResolver` (a `ParametersResolverInterface` from `yiisoft/middleware-dispatcher`)
instantiates action parameters typed as `RequestInputInterface`, hydrates them from the request, and validates:

```php
// config/common/di/input-http.php (package ships this in config/di-web.php)
use Yiisoft\Definitions\Reference;
use Yiisoft\Hydrator\Validator\ValidatingHydrator;
use Yiisoft\Input\Http\RequestInputParametersResolver;

return [
    RequestInputParametersResolver::class => [
        '__construct()' => [
            'hydrator' => Reference::to(ValidatingHydrator::class),
            'throwInputValidationException'
                => $params['yiisoft/input-http']['requestInputParametersResolver']['throwInputValidationException'],
        ],
    ],
];
```

```php
// config/common/params.php
return [
    'yiisoft/input-http' => [
        'requestInputParametersResolver' => [
            'throwInputValidationException' => false, // default
        ],
    ],
];
```

- `throwInputValidationException: false` (default) — the action itself checks
  `$input->getValidationResult()->isValid()` and shapes the error response.
- `true` — invalid input throws `Yiisoft\Input\Http\InputValidationException` (constructor takes the `Result`,
  exposes `getResult(): Result`) before the action runs; pair with a Problem Details renderer
  (see [Error Handling Guide](error-handling.md)).

There is **no** `#[FromRoute]`, `#[FromHeader]`, or `#[FromCookie]` data attribute in this package — route arguments
come via `Yiisoft\Router\CurrentRoute` (see [Routing Guide](routes.md)), headers/cookies via parameter attributes or
direct PSR-7 access.

---

## 9. Choosing the Right Tool

| Scenario | Tool | Notes |
|---|---|---|
| JSON API input | plain DTO + `#[Validate]`/rule attributes, hydrated by `ValidatingHydrator` (via `input-http` or manually) | DTOs live in the application layer; no HTML helpers needed |
| HTML form (server-rendered) | `FormModel` + `FormHydrator::populateFromPostAndValidate()` | labels/hints/placeholders feed the view; errors re-render the form |
| One-off value check in a use case | `$validator->validate($value, [new ...])` with a plain rules map | no DTO needed |
| Internal domain invariants | strict type rules (`Rule\Type\*`) + custom rules | HTTP leniency (`"1"` → `true`) must not leak into the domain |
| Cross-field conditions | `when: fn () => ...`, `FilledAtLeast`, `FilledOnlyOneOf`, or a custom rule reading `ValidationContext` | keep conditions pure |
| Route parameters | `CurrentRoute::getArgument()` + explicit validation, **not** `input-http` | no `FromRoute` attribute exists |

---

## 10. Anti-Pattern Matrix

| Forbidden Anti-Pattern | Why it breaks | Idiomatic Yii3 Solution |
|---|---|---|
| Validating raw `$_POST` / array data inside actions | Actions become untestable and duplicate rules per endpoint | Rule-attribute DTOs / `FormModel`; validate once, pass typed data down |
| Assuming `HasLength`, `NumberValue`, `IsString` rules | These class names do not exist in `yiisoft/validator` — fatal "class not found" | Use `Length`, `Number`, `StringValue` (see §2.3 catalog) |
| Using lenient `Integer`/`BooleanValue` for domain data | `"0"` passes; type drift sneaks into the domain layer | Strict `Rule\Type\*` rules after the HTTP boundary |
| Forgetting `#[Required]` before `#[Length]` etc. | Empty values skip the remaining rules and "pass" validation | Always lead with `#[Required]` or rely on deliberate `skipOnEmpty` |
| Manual `$hydrator->create()` + separate `$validator->validate()` on `ValidatedInputInterface` DTOs | Double validation: `ValidatingHydrator` already validated the object | Inject/resolve `ValidatingHydrator` and read `$dto->getValidationResult()` |
| Calling `$form->getValidationResult()` before validation ran | Throws `LogicException('Validation result is not set.')` | Only read the result after `populate*AndValidate()` / `validate()`; check `isValidated()` |
| Filling models with properties that have no rules and no `#[Safe]` | Not possible by design — data silently not filled; dev expects the value | Add `#[Safe]` or validation rules to the properties that must be filled |
| Inventing `#[FromRoute]` / `#[FromHeader]` attributes | They do not exist in `yiisoft/input-http` — fatal error | Route args via `CurrentRoute`; headers via `#[Request]` or PSR-7 directly |
| Reading JSON body without `RequestBodyParser` middleware | `getParsedBody()` is `null`; hydration silently fills nothing | Register `Yiisoft\Request\Body\RequestBodyParser` before the action (see [PSR-15 Middlewares Guide](middlewares.md)) |
| Custom handler returning `void` or mutating the passed rule | Contract requires returning `Result`; rules must stay immutable | Return `new Result()` with `addError()`; throw `UnexpectedRuleException` on type mismatch |
| Hard-coding English error strings where translation is expected | Breaks i18n; inconsistent with built-in rule messages | Use `{Property}`-style placeholders + `#[Label]`, let the `'yii-validator'` category translate |
| Catching validation errors as exceptions everywhere | With the default config, validation does not throw; the exception path only triggers with `throwInputValidationException: true` | Check `Result` explicitly; enable the exception only with a matching error renderer |

---

## 11. Related Topic Guides

- [Actions & Controllers Guide](actions-and-controllers.md) — Hydrating and validating input DTOs and FormModels in actions.
- [PSR-15 Middlewares Guide](middlewares.md) — RequestBodyParser, validation guards, and middleware pipelines.
- [Routing Guide](routes.md) — Injecting route arguments via CurrentRoute.
- [Error Handling Guide](error-handling.md) — Exception responders for validation errors and RFC 7807 problem details.
- [Dependency Protocol](dependency-protocol.md) — Resolving and installing required validation packages.

