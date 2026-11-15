# Yii3 Testing: Unit Testing Use Cases, Validation, Fixtures & State Isolation

> **Grounding:** APIs in `vendor/yiisoft/<pkg>/src/`, patterns in this guide, conventions in architecture artifact (SKILL.md Core rule 2).

> Idiomatic unit testing recipes for Yii3 applications: zero-shot compilable application use case tests, domain validation tests (`yiisoft/validator`), test fixture assembly via `yiisoft/factory`, and container state isolation with `StateResetter`.

## Table of Contents

- [5. Unit Testing Use Cases, Validation, Fixtures & State Isolation](#5-unit-testing-use-cases-validation-fixtures--state-isolation)
  - [5.1. Unit Testing Application Use Cases (Zero-Shot Compilable)](#51-unit-testing-application-use-cases-zero-shot-compilable)
  - [5.2. Unit Testing Domain Validation (`yiisoft/validator`)](#52-unit-testing-domain-validation-yiisoftvalidator)
  - [5.3. Test Fixture Assembly via `yiisoft/factory`](#53-test-fixture-assembly-via-yiisoftfactory)
  - [5.4. Container State Isolation via `yiisoft/di` (`StateResetter`)](#54-container-state-isolation-via-yiisoftdi-stateresetter)

## 5. Unit Testing Use Cases, Validation, Fixtures & State Isolation

### 5.1. Unit Testing Application Use Cases (Zero-Shot Compilable)

Unit tests run in isolation with zero database or network overhead. Dependencies are either mocked via PHPUnit or replaced with `yiisoft/test-support` doubles:

```php
declare(strict_types=1);

namespace App\Tests\Unit\Application\UseCase\User;

use DateTimeImmutable;
use PHPUnit\Framework\TestCase;
use Psr\Clock\ClockInterface;
use Psr\EventDispatcher\EventDispatcherInterface;
use Psr\Log\LoggerInterface;
use Yiisoft\Test\Support\Clock\StaticClock;
use Yiisoft\Test\Support\EventDispatcher\SimpleEventDispatcher;
use Yiisoft\Test\Support\Log\SimpleLogger;

// 1. Pure Domain Entities and DTOs
final class User
{
    public function __construct(
        private string $email,
        private string $name,
        private DateTimeImmutable $createdAt,
    ) {}

    public function getEmail(): string { return $this->email; }
    public function getName(): string { return $this->name; }
    public function getCreatedAt(): DateTimeImmutable { return $this->createdAt; }
}

final readonly class CreateUserCommand
{
    public function __construct(
        public string $email,
        public string $name,
    ) {}
}

final class UserCreatedEvent
{
    public function __construct(public readonly User $user) {}
}

interface UserRepositoryInterface
{
    public function save(User $user): void;
}

// 2. Application Use Case
final class CreateUserUseCase
{
    public function __construct(
        private UserRepositoryInterface $repository,
        private EventDispatcherInterface $eventDispatcher,
        private LoggerInterface $logger,
        private ClockInterface $clock,
    ) {}

    public function execute(CreateUserCommand $command): User
    {
        $user = new User(
            email: $command->email,
            name: $command->name,
            createdAt: $this->clock->now(),
        );

        $this->repository->save($user);
        $this->eventDispatcher->dispatch(new UserCreatedEvent($user));
        $this->logger->info('User {email} created successfully.', ['email' => $user->getEmail()]);

        return $user;
    }
}

// 3. Complete Zero-Shot Unit Test
final class CreateUserUseCaseTest extends TestCase
{
    public function testCreatesUserSuccessfully(): void
    {
        // Mock external repository contract
        $repository = $this->createMock(UserRepositoryInterface::class);
        $repository->expects($this->once())
            ->method('save')
            ->with($this->callback(static function (User $user): bool {
                return $user->getEmail() === 'alex@example.com'
                    && $user->getName() === 'Alex Johnson';
            }));

        // Pre-built PSR test doubles from yiisoft/test-support
        $eventDispatcher = new SimpleEventDispatcher();
        $logger = new SimpleLogger();
        $clock = new StaticClock(new DateTimeImmutable('2026-10-22 10:00:00'));

        // Instantiate Use Case with explicit dependencies
        $useCase = new CreateUserUseCase(
            repository: $repository,
            eventDispatcher: $eventDispatcher,
            logger: $logger,
            clock: $clock,
        );

        // Execute command
        $user = $useCase->execute(new CreateUserCommand(
            email: 'alex@example.com',
            name: 'Alex Johnson',
        ));

        // Assert domain state
        $this->assertSame('Alex Johnson', $user->getName());
        $this->assertSame('alex@example.com', $user->getEmail());
        $this->assertSame('2026-10-22 10:00:00', $user->getCreatedAt()->format('Y-m-d H:i:s'));

        // Assert side effects
        $this->assertCount(1, $eventDispatcher->getEvents());
        $this->assertTrue($eventDispatcher->isClassTriggered(UserCreatedEvent::class));
        $this->assertCount(1, $logger->getMessages());
        $this->assertSame('User alex@example.com created successfully.', $logger->getMessages()[0]['message']);
    }
}
```

---

### 5.2. Unit Testing Domain Validation (`yiisoft/validator`)

`Yiisoft\Validator\Validator` can be instantiated without parameters (`new Validator()`). It automatically wires an in-memory `SimpleRuleHandlerContainer` for built-in rules, enabling sub-millisecond unit testing of validation rules, DTOs, and custom rule handlers.

#### 1. DTO Validation with Attributes
```php
declare(strict_types=1);

namespace App\Tests\Unit\Dto;

use PHPUnit\Framework\TestCase;
use Yiisoft\Validator\Rule\Email;
use Yiisoft\Validator\Rule\Length;
use Yiisoft\Validator\Rule\Required;
use Yiisoft\Validator\Validator;

final class RegisterUserDto
{
    public function __construct(
        #[Required]
        #[Length(min: 3, max: 50)]
        public readonly string $username = '',

        #[Required]
        #[Email]
        public readonly string $email = '',
    ) {}
}

final class RegisterUserDtoTest extends TestCase
{
    public function testValidationPassesForValidData(): void
    {
        $validator = new Validator();
        $dto = new RegisterUserDto('alex', 'alex@example.com');

        $result = $validator->validate($dto);

        $this->assertTrue($result->isValid());
        $this->assertEmpty($result->getErrors());
    }

    public function testValidationFailsForInvalidData(): void
    {
        $validator = new Validator();
        $dto = new RegisterUserDto('a', 'invalid-email');

        $result = $validator->validate($dto);

        $this->assertFalse($result->isValid());

        // Target property assertions
        $this->assertFalse($result->isPropertyValid('username'));
        $this->assertFalse($result->isPropertyValid('email'));

        $this->assertCount(1, $result->getPropertyErrorMessages('username'));
        $this->assertCount(1, $result->getPropertyErrorMessages('email'));

        // Inspect indexed errors
        $errorsByPath = $result->getErrorMessagesIndexedByPath();
        $this->assertArrayHasKey('username', $errorsByPath);
        $this->assertArrayHasKey('email', $errorsByPath);
    }
}
```

#### 2. Custom Validation Rule & Handler Testing

Custom validation rules decouple definition (`RuleInterface`) from execution (`RuleHandlerInterface`). In tests, rule handlers with service dependencies can be tested in isolation (by instantiating the handler and calling `validate()` directly) or integrated with `Validator` via a `SimpleRuleHandlerContainer` preloaded with mocked handler dependencies.

> [!TIP]
> **Custom Validation Rule Testing Reference:**
> For the complete recipe on integration-testing custom rules through the validator engine — `SimpleRuleHandlerContainer` wiring with mocked handler dependencies, DTO attribute discovery, and `skipOnEmpty` / `when` modifier behavior — see the [Custom Validation Rules & Testing Guide, §6.2 Strategy B](http-validation-custom-rules.md#62-strategy-b-integration-testing-via-validator-with-simplerulehandlercontainer).

---

### 5.3. Test Fixture Assembly via `yiisoft/factory`

Per `package-catalog.md`, `yiisoft/factory` is the recommended tool to assemble domain fixtures and complex object graphs without hand-wiring repetitive constructors.

#### Key Invariant: Unshared Instances
Unlike a PSR-11 container, which caches instances as singletons, `Factory::create(...)` always returns a **fresh, unshared instance** (`assertNotSame($obj1, $obj2)`), preventing cross-test state pollution. Full `Factory` / `StrictFactory` semantics (constructor argument order, definition-map rules, exception behavior) are owned by the [DI & Configuration Guide](core-di-container.md), section 6.2.

```php
declare(strict_types=1);

namespace App\Tests\Unit\Fixture;

use PHPUnit\Framework\TestCase;
use Yiisoft\Factory\Factory;
use Yiisoft\Factory\StrictFactory;

final class Address
{
    public function __construct(
        public readonly string $street,
        public readonly string $city,
    ) {}
}

final class Customer
{
    public function __construct(
        public readonly string $name,
        public readonly Address $address,
        public readonly bool $isVip = false,
    ) {}
}

final class CustomerFixtureTest extends TestCase
{
    public function testAssemblesObjectGraphWithOverrides(): void
    {
        // 1. Configure baseline definitions
        $factory = new Factory(definitions: [
            Address::class => [
                'class' => Address::class,
                '__construct()' => [
                    'street' => '100 Main St',
                    'city' => 'Springfield',
                ],
            ],
            Customer::class => [
                'class' => Customer::class,
                '__construct()' => [
                    'name' => 'John Doe',
                    'isVip' => false,
                ],
            ],
        ]);

        // 2. Create unshared baseline instances
        $customer1 = $factory->create(Customer::class);
        $customer2 = $factory->create(Customer::class);

        $this->assertSame('John Doe', $customer1->name);
        $this->assertSame('Springfield', $customer1->address->city);
        $this->assertNotSame($customer1, $customer2); // Always unshared!

        // 3. Override properties on the fly per scenario
        /** @var Customer $vipCustomer */
        $vipCustomer = $factory->create([
            'class' => Customer::class,
            '__construct()' => [
                'name' => 'Alice Smith',
                'isVip' => true,
            ],
        ]);

        $this->assertSame('Alice Smith', $vipCustomer->name);
        $this->assertTrue($vipCustomer->isVip);
        $this->assertSame('Springfield', $vipCustomer->address->city);

        // 4. Scoped definitions using withDefinitions()
        $specialFactory = $factory->withDefinitions([
            Address::class => [
                'class' => Address::class,
                '__construct()' => [
                    'street' => '500 Tech Blvd',
                    'city' => 'Metropolis',
                ],
            ],
        ]);

        /** @var Customer $metroCustomer */
        $metroCustomer = $specialFactory->create(Customer::class);
        $this->assertSame('Metropolis', $metroCustomer->address->city);
    }

    public function testStrictFactoryRequiresRegisteredDefinitions(): void
    {
        $strictFactory = new StrictFactory([
            Address::class => [
                'class' => Address::class,
                '__construct()' => ['street' => '1st Ave', 'city' => 'Boston'],
            ],
        ]);

        $this->assertInstanceOf(Address::class, $strictFactory->create(Address::class));

        // StrictFactory throws NotFoundException if class definition is absent
        $this->expectException(\Yiisoft\Factory\NotFoundException::class);
        $strictFactory->create(Customer::class);
    }
}
```

---

### 5.4. Container State Isolation via `yiisoft/di` (`StateResetter`)

In long-running integration test suites where the PSR-11 container is booted once (`setUpBeforeClass()`) for performance, stateful services leak data into subsequent tests.

`Yiisoft\Di\StateResetter` resets stateful singletons between tests via the definition-level `'reset'` closures (binding mechanics and caveats are owned by the [DI & Configuration Guide](core-di-container.md), section 5.2):

```php
declare(strict_types=1);

namespace App\Tests\Integration;

use PHPUnit\Framework\TestCase;
use Yiisoft\Di\Container;
use Yiisoft\Di\ContainerConfig;
use Yiisoft\Di\StateResetter;

final class InMemoryBuffer
{
    /** @var list<string> */
    private array $buffer = [];

    public function push(string $item): void
    {
        $this->buffer[] = $item;
    }

    public function count(): int
    {
        return count($this->buffer);
    }
}

final class StateIsolationTest extends TestCase
{
    private static Container $container;

    public static function setUpBeforeClass(): void
    {
        $config = ContainerConfig::create()->withDefinitions([
            InMemoryBuffer::class => [
                'class' => InMemoryBuffer::class,
                // Reserved 'reset' key — closure bound to the instance (DI guide §5.2)
                'reset' => function () {
                    $this->buffer = [];
                },
            ],
        ]);

        self::$container = new Container($config);
    }

    protected function tearDown(): void
    {
        // Reset all stateful container services after each test
        self::$container->get(StateResetter::class)->reset();
        parent::tearDown();
    }

    public function testStepOneAddsItems(): void
    {
        $buffer = self::$container->get(InMemoryBuffer::class);
        $buffer->push('alpha');
        $buffer->push('beta');

        $this->assertSame(2, $buffer->count());
    }

    public function testStepTwoStartsCleanDueToStateResetter(): void
    {
        // Thanks to tearDown() StateResetter::reset(), the buffer is clean!
        $buffer = self::$container->get(InMemoryBuffer::class);
        $this->assertSame(0, $buffer->count());
    }
}
```

---
