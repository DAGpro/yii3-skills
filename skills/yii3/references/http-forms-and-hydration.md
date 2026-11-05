# Yii3 Forms & Typed DTO Hydration

> [!IMPORTANT]
> **Grounding rule:** sources of truth are split by question type — API: installed `vendor/yiisoft/<pkg>/src/` (versions via `composer.lock`); implementation patterns: this guide; project conventions: the project's architecture artifact or dominant `src/` style. Full table and conflict rule: SKILL.md Core rule 2.

> Part of the [Validation & Forms Guide](http-validation-and-forms.md) split — the index, decision matrix, anti-pattern matrix, and related guides live there.

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
- **View Template & Widget Rendering:** Opening forms with CSRF (`Html::form()->post()->csrf($csrf)->open()`), field widget binding (`Field::text($form, 'name')`), and Bootstrap 5/Bulma theming are owned by the [Views & Widgets Guide, §8](http-widgets-and-assets.md#8-html-form-rendering-yiisofthtml-yiisoftform-model-yiisoftform).

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
> For the complete factory catalog of form inputs (`Field::text`, `Field::select`, `Field::checkboxList`, `Field::radioList`), theme-aware DI with `FieldFactory`, and model-agnostic forms with `PureField`, see the [Views & Widgets Guide, §8](http-widgets-and-assets.md#8-html-form-rendering-yiisofthtml-yiisoftform-model-yiisoftform).

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
