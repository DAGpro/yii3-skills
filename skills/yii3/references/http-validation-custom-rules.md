# Yii3 Custom Validation Rules & Testing Guide

> [!IMPORTANT]
> **Grounding rule:** sources of truth are split by question type — API: installed `vendor/yiisoft/<pkg>/src/` (versions via `composer.lock`); implementation patterns: this guide; project conventions: the project's architecture artifact or dominant `src/` style. Full table and conflict rule: SKILL.md Core rule 2.

> Practical architecture guide and testing reference for authoring custom validation rules (`RuleInterface`), service handlers (`RuleHandlerInterface`), dependency injection configuration (`RuleHandlerContainer`), compound rules, and isolated unit and integration testing strategies in Yii 3 with `yiisoft/validator`.

---

## Table of Contents
- [1. Architectural Model: Rule vs. RuleHandler Split](#1-architectural-model-rule-vs-rulehandler-split)
- [2. Implementing Custom Rules (`RuleInterface`)](#2-implementing-custom-rules-ruleinterface)
  - [2.1. Rule Value Object & PHP 8 Attribute](#21-rule-value-object--php-8-attribute)
  - [2.2. Standard Flow Modifiers: SkipOnEmptyTrait, SkipOnErrorTrait, WhenTrait](#22-standard-flow-modifiers-skiponemptytrait-skiponerrortrait-whentrait)
  - [2.3. Frontend Client-Side Export (`DumpedRuleInterface`)](#23-frontend-client-side-export-dumpedruleinterface)
- [3. Implementing Rule Handlers (`RuleHandlerInterface`)](#3-implementing-rule-handlers-rulehandlerinterface)
  - [3.1. Handler Contract & UnexpectedRuleException Guard](#31-handler-contract--unexpectedruleexception-guard)
  - [3.2. Accumulating Errors via Result & Placeholder Substitution](#32-accumulating-errors-via-result--placeholder-substitution)
  - [3.3. Cross-Property Validation via ValidationContext](#33-cross-property-validation-via-validationcontext)
- [4. Dependency Injection in Handlers & The Resolver Trap](#4-dependency-injection-in-handlers--the-resolver-trap)
  - [4.1. The SimpleRuleHandlerContainer Trap Explained](#41-the-simplerulehandlercontainer-trap-explained)
  - [4.2. Wiring RuleHandlerContainer in DI Configuration](#42-wiring-rulehandlercontainer-in-di-configuration)
  - [4.3. Injecting Repositories, Database Services & External Clients](#43-injecting-repositories-database-services--external-clients)
- [5. Alternative Rule Archetypes](#5-alternative-rule-archetypes)
  - [5.1. One-Off Checks with Callback Rule](#51-one-off-checks-with-callback-rule)
  - [5.2. Reusable Compound Rules (`Rule\Composite`)](#52-reusable-compound-rules-rulecomposite)
- [6. Comprehensive Testing Strategies](#6-comprehensive-testing-strategies)
  - [6.1. Strategy A: Isolated Unit Testing of Handlers (Zero Framework Overhead)](#61-strategy-a-isolated-unit-testing-of-handlers-zero-framework-overhead)
  - [6.2. Strategy B: Integration Testing via Validator with SimpleRuleHandlerContainer](#62-strategy-b-integration-testing-via-validator-with-simplerulehandlercontainer)
  - [6.3. Testing Cross-Property Validation via ArrayDataSet](#63-testing-cross-property-validation-via-arraydataset)
  - [6.4. Testing Edge Cases & UnexpectedRuleException](#64-testing-edge-cases--unexpectedruleexception)
- [7. Master Named Arguments & Signatures Reference](#7-master-named-arguments--signatures-reference)
- [8. Anti-Pattern Matrix: Custom Validation Rules](#8-anti-pattern-matrix-custom-validation-rules)
- [9. Related Guides](#9-related-guides)

---

## 1. Architectural Model: Rule vs. RuleHandler Split

In Yii 2, validation rules were either methods inside active record/model classes or monolithic classes extending `yii\validators\Validator` that mingled configuration options with execution logic and database calls.

In Yii 3, `yiisoft/validator` enforces a strict **Single Responsibility** separation between configuration and execution:

```
┌───────────────────────────────────────┐                 ┌─────────────────────────────────────────┐
│        Rule (Value Object / DTO)      │                 │           RuleHandler (Service)         │
│  implements RuleInterface             │                 │  implements RuleHandlerInterface        │
│  #[Attribute(TARGET_PROPERTY)]        │  delegates to   │                                         │
│  - Immutable constraint options       │ ──────────────> │  - Stateless or injected execution logic │
│  - Error message templates            │  getHandler()   │  - Injects DB repositories or APIs      │
│  - Modifiers (skipOnEmpty, when)      │                 │  - Returns mutable Result accumulator   │
└───────────────────────────────────────┘                 └─────────────────────────────────────────┘
```

1. **`Yiisoft\Validator\RuleInterface` (The Rule):**
   - An immutable data container carrying configuration parameters (e.g., minimum length, error message template, whether to skip empty inputs).
   - Decorated with `#[Attribute(Attribute::TARGET_PROPERTY | Attribute::IS_REPEATABLE)]` so it can annotate typed DTO properties.
   - Declares its corresponding execution service through `getHandler(): string|RuleHandlerInterface`.
2. **`Yiisoft\Validator\RuleHandlerInterface` (The Handler):**
   - A dedicated service containing the actual assertion algorithm: `validate(mixed $value, RuleInterface $rule, ValidationContext $context): Result`.
   - Never stored in memory together with the rule. Handlers are instantiated on demand by `RuleHandlerResolverInterface`.
   - Free to inject constructor dependencies (repositories, database connections, clock, cache, external HTTP clients).

---

## 2. Implementing Custom Rules (`RuleInterface`)

### 2.1. Rule Value Object & PHP 8 Attribute

A custom rule must implement `RuleInterface` and declare `getHandler(): string`. By convention, the handler class name shares the rule's name with a `Handler` suffix.

```php
declare(strict_types=1);

namespace App\Domain\Shared\Validator\Rule;

use Attribute;
use Yiisoft\Validator\RuleInterface;

#[Attribute(Attribute::TARGET_PROPERTY | Attribute::IS_REPEATABLE)]
final class TaxIdNumber implements RuleInterface
{
    public function __construct(
        public readonly string $country = 'US',
        public readonly string $message = 'The value "{value}" is not a valid tax ID for country "{country}".',
    ) {}

    public function getHandler(): string
    {
        return TaxIdNumberHandler::class;
    }
}
```

---

### 2.2. Standard Flow Modifiers: SkipOnEmptyTrait, SkipOnErrorTrait, WhenTrait

To support Yii 3 standard validation modifiers (`skipOnEmpty: true`, `skipOnError: true`, `when: fn(...) => ...`), your rule should implement the corresponding marker interfaces and consume the official framework traits:

| Interface | Trait | Role |
|---|---|---|
| `Yiisoft\Validator\SkipOnEmptyInterface` | `Yiisoft\Validator\Rule\Trait\SkipOnEmptyTrait` | Controls skipping when value is empty (`null`, `''`, `[]`). Defaults to `null` (never skip). |
| `Yiisoft\Validator\SkipOnErrorInterface` | `Yiisoft\Validator\Rule\Trait\SkipOnErrorTrait` | Skips validation if previous rules on the same property failed. |
| `Yiisoft\Validator\WhenInterface` | `Yiisoft\Validator\Rule\Trait\WhenTrait` | Conditional validation closure: `fn(mixed $value, ValidationContext $context): bool`. |

```php
declare(strict_types=1);

namespace App\Domain\Shared\Validator\Rule;

use Attribute;
use Closure;
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

    // Backing properties are NOT declared by the traits (only SkipOnEmptyTrait ships `$skipOnEmpty` itself).
    // Without these declarations the assignments below create dynamic properties (deprecated in PHP 8.2).
    private bool $skipOnError = false;
    private ?Closure $when = null;

    public function __construct(
        public readonly string $message = 'User with email "{value}" is already registered.',
        mixed $skipOnEmpty = null,
        bool $skipOnError = false,
        ?Closure $when = null,
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

---

### 2.3. Frontend Client-Side Export (`DumpedRuleInterface`)

When generating client-side validation rules (e.g. for HTML5 form attributes or frontend JavaScript validation libraries), extend `DumpedRuleInterface` instead of `RuleInterface`:

```php
declare(strict_types=1);

namespace App\Domain\Shared\Validator\Rule;

use Attribute;
use Yiisoft\Validator\DumpedRuleInterface;

#[Attribute(Attribute::TARGET_PROPERTY | Attribute::IS_REPEATABLE)]
final class Slug implements DumpedRuleInterface
{
    public function __construct(
        public readonly string $message = 'Value must contain only lowercase letters, numbers, and dashes.',
    ) {}

    public function getHandler(): string
    {
        return SlugHandler::class;
    }

    public function getName(): string
    {
        return 'slug';
    }

    /**
     * @return array<string, mixed>
     */
    public function getOptions(): array
    {
        return [
            'pattern' => '^[a-z0-9]+(?:-[a-z0-9]+)*$',
            'message' => [
                'template' => $this->message,
                'parameters' => [],
            ],
        ];
    }
}
```

---

## 3. Implementing Rule Handlers (`RuleHandlerInterface`)

### 3.1. Handler Contract & UnexpectedRuleException Guard

A rule handler implements `Yiisoft\Validator\RuleHandlerInterface`:
`public function validate(mixed $value, RuleInterface $rule, ValidationContext $context): Result;`

> [!IMPORTANT]
> **Mandatory Rule Type Check:**
> The first line of every `validate()` method **must** assert that `$rule` is an instance of the expected rule class. If an unexpected rule instance is supplied, throw `Yiisoft\Validator\Exception\UnexpectedRuleException`.

```php
declare(strict_types=1);

namespace App\Domain\Shared\Validator\Rule;

use Yiisoft\Validator\Exception\UnexpectedRuleException;
use Yiisoft\Validator\Result;
use Yiisoft\Validator\RuleHandlerInterface;
use Yiisoft\Validator\RuleInterface;
use Yiisoft\Validator\ValidationContext;

final readonly class TaxIdNumberHandler implements RuleHandlerInterface
{
    public function validate(mixed $value, RuleInterface $rule, ValidationContext $context): Result
    {
        if (!$rule instanceof TaxIdNumber) {
            throw new UnexpectedRuleException(TaxIdNumber::class, $rule);
        }

        $result = new Result();
        if (!is_string($value) || $value === '') {
            return $result;
        }

        if (!$this->isValidFormat($value, $rule->country)) {
            $result->addError($rule->message, [
                'property' => $context->getTranslatedProperty(),
                'Property' => $context->getCapitalizedTranslatedProperty(),
                'value' => $value,
                'country' => $rule->country,
            ]);
        }

        return $result;
    }

    private function isValidFormat(string $taxId, string $country): bool
    {
        return match ($country) {
            'US' => (bool) preg_match('/^\d{2}-\d{7}$/', $taxId),
            'DE' => (bool) preg_match('/^\d{11}$/', $taxId),
            default => strlen($taxId) >= 5,
        };
    }
}
```

---

### 3.2. Accumulating Errors via Result & Placeholder Substitution

`Yiisoft\Validator\Result` is a mutable error accumulator:
- Call `$result->addError(string|\Stringable $message, array $parameters = [], array $valuePath = []): self` to record a violation (fluent — returns the same `Result` instance).
- Standard placeholders supported by Yii 3 message formatters:
  - `{property}` — localized property name (e.g. `email address`).
  - `{Property}` — capitalized localized property name (e.g. `Email address`).
  - `{value}` — formatted string representation of the validated value.
  - Custom keys defined in the `$parameters` array matching tokens in `$rule->message` (e.g. `{country}`).

```php
$result->addError($rule->message, [
    'property' => $context->getTranslatedProperty(),
    'Property' => $context->getCapitalizedTranslatedProperty(),
    'value' => $value,
    'country' => $rule->country,
]);
```

---

### 3.3. Cross-Property Validation via ValidationContext

When a custom rule needs to compare against sibling properties in the dataset (for example, verifying that `endDate` is chronologically after `startDate`, or checking conditional combinations):

1. Call `$context->getDataSet()` to obtain the `DataSetInterface` instance representing the current validation scope.
2. Call `$dataSet->getPropertyValue(string $property)` to inspect sibling values safely.

```php
declare(strict_types=1);

namespace App\Domain\Shared\Validator\Rule;

use DateTimeImmutable;
use Yiisoft\Validator\Exception\UnexpectedRuleException;
use Yiisoft\Validator\Result;
use Yiisoft\Validator\RuleHandlerInterface;
use Yiisoft\Validator\RuleInterface;
use Yiisoft\Validator\ValidationContext;

final readonly class DateAfterPropertyHandler implements RuleHandlerInterface
{
    public function validate(mixed $value, RuleInterface $rule, ValidationContext $context): Result
    {
        if (!$rule instanceof DateAfterProperty) {
            throw new UnexpectedRuleException(DateAfterProperty::class, $rule);
        }

        $result = new Result();
        if (!$value instanceof DateTimeImmutable) {
            return $result;
        }

        $dataSet = $context->getDataSet(); // Non-nullable: throws RuntimeException when no data set was set.
        if (!$dataSet->hasProperty($rule->targetProperty)) {
            return $result;
        }

        $targetValue = $dataSet->getPropertyValue($rule->targetProperty);
        if (!$targetValue instanceof DateTimeImmutable) {
            return $result;
        }

        if ($value <= $targetValue) {
            $result->addError($rule->message, [
                'property' => $context->getTranslatedProperty(),
                'targetProperty' => $rule->targetProperty,
                'targetValue' => $targetValue->format('Y-m-d H:i:s'),
            ]);
        }

        return $result;
    }
}
```

---

## 4. Dependency Injection in Handlers & The Resolver Trap

### 4.1. The SimpleRuleHandlerContainer Trap Explained

> [!CAUTION]
> **The `SimpleRuleHandlerContainer` Trap:**
> In `yiisoft/validator`'s default `config/di.php`, `RuleHandlerResolverInterface::class` is bound to `Yiisoft\Validator\RuleHandlerResolver\SimpleRuleHandlerContainer`.
> `SimpleRuleHandlerContainer` instantiates handlers using `new $handlerName()`. If your custom rule handler injects application services (such as a database connection, repository, or hasher), validation crashes with:
> `ArgumentCountError: Too few arguments to function ...Handler::__construct(), 0 passed`.

---

### 4.2. Wiring RuleHandlerContainer in DI Configuration

To allow custom handlers to receive constructor dependencies, rebind `RuleHandlerResolverInterface` in your application configuration (`config/common/di/validator.php`) to `RuleHandlerContainer`. `RuleHandlerContainer` resolves handlers through the application's PSR-11 container:

```php
// config/common/di/validator.php
declare(strict_types=1);

use Yiisoft\Validator\RuleHandlerResolver\RuleHandlerContainer;
use Yiisoft\Validator\RuleHandlerResolverInterface;

return [
    RuleHandlerResolverInterface::class => RuleHandlerContainer::class,
];
```

---

### 4.3. Injecting Repositories, Database Services & External Clients

With `RuleHandlerContainer` wired, write your handler as a standard readonly service:

```php
declare(strict_types=1);

namespace App\Domain\Shared\Validator\Rule;

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

---

## 5. Alternative Rule Archetypes

### 5.1. One-Off Checks with Callback Rule

For ad-hoc validations unique to a single DTO or form where creating a full Rule + Handler pair is excessive overhead, use `Yiisoft\Validator\Rule\Callback`:

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
            $result->addError('New password must differ from current password.', [
                'property' => $context->getTranslatedProperty(),
            ]);
        }
        return $result;
    }
}
```

---

### 5.2. Reusable Compound Rules (`Rule\Composite`)

When multiple rules are routinely combined across different DTOs, subclass `Yiisoft\Validator\Rule\Composite` to package them into a single reusable attribute:

```php
declare(strict_types=1);

namespace App\Domain\Shared\Validator\Rule;

use Attribute;
use Yiisoft\Validator\Rule\Composite;
use Yiisoft\Validator\Rule\Length;
use Yiisoft\Validator\Rule\Regex;
use Yiisoft\Validator\Rule\Required;

#[Attribute(Attribute::TARGET_PROPERTY | Attribute::IS_REPEATABLE)]
final class StrongPassword extends Composite
{
    public function __construct(
        int $minLength = 8,
        int $maxLength = 128,
        mixed $skipOnEmpty = null,
    ) {
        parent::__construct(
            rules: [
                new Required(),
                new Length(min: $minLength, max: $maxLength),
                new Regex(
                    pattern: '/[A-Z]/',
                    message: 'Password must contain at least one uppercase letter.',
                ),
                new Regex(
                    pattern: '/[0-9]/',
                    message: 'Password must contain at least one digit.',
                ),
            ],
            skipOnEmpty: $skipOnEmpty,
        );
    }
}
```

---

## 6. Comprehensive Testing Strategies

### 6.1. Strategy A: Isolated Unit Testing of Handlers (Zero Framework Overhead)

Because rule handlers (`RuleHandlerInterface` implementations) are ordinary PHP classes, test them in complete isolation without bootstrapping a DI container, database, or HTTP runner. Mock injected dependencies and construct a standalone `ValidationContext` (note: `ValidationContext::setDataSet()` and `setProperty()` are marked `@internal` in `yiisoft/validator` — the validator wires them itself; using them to build a test context is acceptable but treats them as unstable API):

```php
declare(strict_types=1);

namespace App\Tests\Unit\Domain\Shared\Validator\Rule;

use App\Domain\Shared\Validator\Rule\UniqueUserEmail;
use App\Domain\Shared\Validator\Rule\UniqueUserEmailHandler;
use App\Domain\User\UserRepositoryInterface;
use PHPUnit\Framework\TestCase;
use Yiisoft\Validator\DataSet\ArrayDataSet;
use Yiisoft\Validator\ValidationContext;

final class UniqueUserEmailHandlerTest extends TestCase
{
    public function testEmailAlreadyTakenProducesValidationError(): void
    {
        $repositoryMock = $this->createMock(UserRepositoryInterface::class);
        $repositoryMock
            ->expects($this->once())
            ->method('hasByEmail')
            ->with('taken@example.com')
            ->willReturn(true);

        $handler = new UniqueUserEmailHandler($repositoryMock);
        $rule = new UniqueUserEmail();
        $context = (new ValidationContext())
            ->setDataSet(new ArrayDataSet(['email' => 'taken@example.com']))
            ->setProperty('email');

        $result = $handler->validate('taken@example.com', $rule, $context);

        $this->assertFalse($result->isValid());
        // A directly-called handler skips the validator pipeline (translator + formatter), so the raw
        // message template with placeholders is returned. Substituted text appears only in full-pipeline
        // tests (see §6.2).
        $this->assertSame(
            ['User with email "{value}" is already registered.'],
            $result->getErrorMessages(),
        );
    }

    public function testAvailableEmailPassesCleanly(): void
    {
        $repositoryMock = $this->createMock(UserRepositoryInterface::class);
        $repositoryMock
            ->expects($this->once())
            ->method('hasByEmail')
            ->with('available@example.com')
            ->willReturn(false);

        $handler = new UniqueUserEmailHandler($repositoryMock);
        $rule = new UniqueUserEmail();
        $context = (new ValidationContext())
            ->setDataSet(new ArrayDataSet(['email' => 'available@example.com']))
            ->setProperty('email');

        $result = $handler->validate('available@example.com', $rule, $context);

        $this->assertTrue($result->isValid());
        $this->assertSame([], $result->getErrors());
    }
}
```

---

### 6.2. Strategy B: Integration Testing via Validator with SimpleRuleHandlerContainer

To test the entire pipeline (including attribute discovery on DTOs, `skipOnEmpty: true`, and `when:` conditional closures), instantiate `Yiisoft\Validator\Validator` with a pre-configured `SimpleRuleHandlerContainer` containing the mock handler:

```php
declare(strict_types=1);

namespace App\Tests\Unit\Domain\Shared\Validator\Rule;

use App\Domain\Shared\Validator\Rule\UniqueUserEmail;
use App\Domain\Shared\Validator\Rule\UniqueUserEmailHandler;
use App\Domain\User\UserRepositoryInterface;
use PHPUnit\Framework\TestCase;
use Yiisoft\Validator\RuleHandlerResolver\SimpleRuleHandlerContainer;
use Yiisoft\Validator\Validator;

final class RegistrationInputDto
{
    public function __construct(
        #[UniqueUserEmail]
        public readonly string $email = '',
    ) {}
}

final class UniqueUserEmailIntegrationTest extends TestCase
{
    public function testValidatesDtoThroughValidatorPipeline(): void
    {
        $repositoryMock = $this->createMock(UserRepositoryInterface::class);
        $repositoryMock
            ->method('hasByEmail')
            ->with('taken@example.com')
            ->willReturn(true);

        // Preload mocked handler directly into SimpleRuleHandlerContainer
        $handlerContainer = new SimpleRuleHandlerContainer([
            UniqueUserEmailHandler::class => new UniqueUserEmailHandler($repositoryMock),
        ]);

        $validator = new Validator(ruleHandlerResolver: $handlerContainer);
        $dto = new RegistrationInputDto(email: 'taken@example.com');

        $result = $validator->validate($dto);

        $this->assertFalse($result->isValid());
        $this->assertFalse($result->isPropertyValid('email'));
        $this->assertSame(
            ['User with email "taken@example.com" is already registered.'],
            $result->getPropertyErrorMessages('email'),
        );
    }
}
```

---

### 6.3. Testing Cross-Property Validation via ArrayDataSet

When verifying rules that interact with multiple fields via `$context->getDataSet()`, feed test fixture arrays using `ArrayDataSet` (same `@internal` caveat for the context setters as in §6.1):

```php
declare(strict_types=1);

namespace App\Tests\Unit\Domain\Shared\Validator\Rule;

use DateTimeImmutable;
use PHPUnit\Framework\TestCase;
use Yiisoft\Validator\DataSet\ArrayDataSet;
use Yiisoft\Validator\ValidationContext;

final class DateAfterPropertyTest extends TestCase
{
    public function testFailsWhenEndDateIsBeforeStartDate(): void
    {
        $startDate = new DateTimeImmutable('2026-12-01 10:00:00');
        $endDate = new DateTimeImmutable('2026-11-01 10:00:00');

        $dataSet = new ArrayDataSet([
            'startDate' => $startDate,
            'endDate' => $endDate,
        ]);

        $context = (new ValidationContext())
            ->setDataSet($dataSet)
            ->setProperty('endDate');

        $rule = new DateAfterProperty(targetProperty: 'startDate');
        $handler = new DateAfterPropertyHandler();

        $result = $handler->validate($endDate, $rule, $context);

        $this->assertFalse($result->isValid());
    }
}
```

---

### 6.4. Testing Edge Cases & UnexpectedRuleException

Always verify that custom handlers fail fast when presented with an incompatible rule instance:

```php
declare(strict_types=1);

namespace App\Tests\Unit\Domain\Shared\Validator\Rule;

use PHPUnit\Framework\TestCase;
use Yiisoft\Validator\Exception\UnexpectedRuleException;
use Yiisoft\Validator\Rule\Required;
use Yiisoft\Validator\ValidationContext;

final class UnexpectedRuleTest extends TestCase
{
    public function testThrowsExceptionWhenPassedWrongRule(): void
    {
        $repositoryMock = $this->createMock(UserRepositoryInterface::class);
        $handler = new UniqueUserEmailHandler($repositoryMock);

        $this->expectException(UnexpectedRuleException::class);
        $this->expectExceptionMessage('Expected "' . UniqueUserEmail::class . '", but "' . Required::class . '" given.');

        $handler->validate('test@example.com', new Required(), new ValidationContext());
    }
}
```

---

## 7. Master Named Arguments & Signatures Reference

### `RuleHandlerInterface::validate`
```php
public function validate(
    mixed $value,
    RuleInterface $rule,
    ValidationContext $context,
): Result;
```

### `Result::addError`
```php
public function addError(
    string|\Stringable $message,
    array $parameters = [],
    array $valuePath = [],
): self;
```

### `ValidationContext` Key Methods
| Method | Return Type | Description |
|---|---|---|
| `$context->getProperty()` | `?string` | Raw name of property being validated (or `null` if validating raw value). |
| `$context->getPropertyLabel()` | `?string` | Custom explicit label assigned to property. |
| `$context->getTranslatedProperty()` | `string` | Localized property name via translator or `#[Label]` (falls back to `'value'`; never null). |
| `$context->getCapitalizedTranslatedProperty()` | `string` | Capitalized localized property name. |
| `$context->getDataSet()` | `DataSetInterface` | Current scope's dataset (allows inspecting sibling fields via `getPropertyValue()`); throws `RuntimeException` when no data set was set. |
| `$context->getGlobalDataSet()` | `DataSetInterface` | Root dataset across all nested structures; throws `RuntimeException` when the validator is not set. |
| `$context->getParameter(string $name, mixed $default = null)` | `mixed` | Retrieves arbitrary context parameters passed during validation. |

---

## 8. Anti-Pattern Matrix: Custom Validation Rules

| # | Forbidden Legacy / Anti-Pattern | Mandatory Idiomatic Yii 3 Pattern | Rationale |
|---|---|---|---|
| 1 | Combining Rule options and handler code inside a single class | Separate into immutable `RuleInterface` value object and `RuleHandlerInterface` service | Enforces single responsibility; prevents rules from carrying service/DB connections. |
| 2 | Forgetting the `RuleHandlerContainer` rebinding in `config/common/di/validator.php` | Bind `RuleHandlerResolverInterface::class => RuleHandlerContainer::class` | `SimpleRuleHandlerContainer` fails with `ArgumentCountError` when handlers inject services. |
| 3 | Instantiating DB connections, PDO, or repositories inside the rule constructor | Inject repositories/services into the `RuleHandlerInterface` constructor | Rules are serialized value objects/attributes; services belong in DI-managed handlers. |
| 4 | Omitting `UnexpectedRuleException` guard check in `validate()` | First line: `if (!$rule instanceof MyRule) throw new UnexpectedRuleException(MyRule::class, $rule);` | Required framework safety contract; guarantees type safety. |
| 5 | Using legacy Yii 2 `$model->addError($attribute, $message)` | Call `$result->addError($rule->message, ['property' => ..., 'value' => ...])` | Result is a standalone mutable accumulator independent of any model instance. |
| 6 | Bootstrapping the full DI container and database just to unit test a rule handler | Instantiate the handler directly with mocked dependencies and `ArrayDataSet` | Isolated unit tests execute in under 1 millisecond and avoid test suite fragility. |
| 7 | Using `$context->getProperty()` instead of `$context->getTranslatedProperty()` in error parameters | Pass `'property' => $context->getTranslatedProperty()` | Ensures user-facing errors show friendly localized labels rather than raw field names. |

---

## 9. Related Guides

- [Validation & Forms Guide](http-validation-and-forms.md) — Built-in rules catalog, modifiers (`skipOnEmpty`, `when`), DTO hydration (`yiisoft/hydrator-validator`), and `FormModel`.
- [Testing Core Guide](testing-core.md) — Overall test architecture, PHPUnit configuration, and PSR test doubles (`yiisoft/test-support`).
- [HTTP Actions & Controllers Guide](http-actions-and-controllers.md) — Wiring validated DTOs (`yiisoft/input-http`) and returning RFC 7807 Problem Details responses.
- [Dependency Injection & Config Guide](core-di-and-config.md) — PSR-11 container configuration and `config/` definition recipes.

