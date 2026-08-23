---
name: yii3-di
description: >-
  Wiring a Yii3 application: DI container (yiisoft/di) definitions — class mappings, array
  definitions, closures, references, aliases, params; the configuration system (yiisoft/config)
  — config-plugin groups in configuration.php, merge layers, params conventions, service providers,
  merge plan rebuild; and PSR-14 events wiring (yiisoft/event-dispatcher + yii-event) — event
  classes, invokable listeners, events config registration, dispatching. Use when user says
  "register service", "add to DI container", "bind interface", "add params", "config",
  "configuration.php", "merge plan", "how to configure package X", "environment-specific config",
  "add event", "listener", "decouple", "on user created do X".
argument-hint: "[service|params task]"
allowed-tools: Read Glob Grep Write Edit Bash(php -l *; composer *) AskUserQuestion Questions
disable-model-invocation: false
metadata:
  author: DAGpro (https://github.com/DAGpro)
  version: "0.1"
  category: framework-yii3
---

# Yii3 DI Container & Configuration

Two halves of application wiring: the PSR-11 container (`yiisoft/di`) and the config system
(`yiisoft/config`) that assembles definition/params files and feeds them `$params`.

## Part A: DI Definitions

### Step 0: Analyze

1. Target environment: shared → `config/common/di/`, web-only → `config/web/di/`,
   console-only → `config/console/di/`.
2. One provider per file by convention: `db-<driver>.php`, `cache.php`, `mailer.php`...
3. Check autowiring first (constructor type-hints all resolvable) — then no registration is needed.

### Definition Styles

```php
// Simplest — class name mapping (autowired dependencies)
return [
    EngineInterface::class => EngineMarkOne::class,
];

// Array definition with constructor args and method calls
MyServiceInterface::class => [
    'class' => MyService::class,
    '__construct()' => ['amount' => 42],
    'setDiscount()' => [10],
];

// Public property values
NameProvider::class => ['class' => NameProvider::class, '$name' => 'Alex'];

// Closure for complex logic — request dependencies directly in the signature
MyServiceInterface::class => static function (ConnectionInterface $db): MyService {
    return new MyService($db);
},

// Static factory or ready instance
MyServiceInterface::class => [MyFactory::class, 'create'],
```

### Parameters → $params

Put scalar/config values into `config/common/params.php` under a provider-prefixed key:

```php
// config/common/di/db-pgsql.php
/** @var array $params */
return [
    ConnectionInterface::class => [
        'class' => Connection::class,
        '__construct()' => [
            'driver' => new Driver(
                $params['yiisoft/db-pgsql']['dsn'],
                $params['yiisoft/db-pgsql']['username'],
                $params['yiisoft/db-pgsql']['password'],
            ),
        ],
    ],
];
```

Secrets come from environment variables, never hardcoded.

### Common Patterns

Multiple implementations via distinct class-string IDs (aliases):

```php
class_alias(Connection::class, AnalyticsDatabase::class);

return [
    ConnectionInterface::class => MainDatabase::class,
    MainDatabase::class => [ /* ... */ ],
    AnalyticsDatabase::class => [ /* ... */ ],
];
```

References between definitions:

```php
use Yiisoft\Definitions\Reference;

ParametersResolverInterface::class => [
    'class' => CompositeParametersResolver::class,
    '__construct()' => [
        Reference::to(HydratorAttributeParametersResolver::class),
        Reference::to(RequestInputParametersResolver::class),
    ],
],
```

## Part B: Configuration System (yiisoft/config)

Configs are assembled by a Composer plugin and become part of the application. The template declares
groups in `config/configuration.php` (referenced by `"config-plugin-file"` in composer.json extra).

### Three Merge Layers

At runtime configs merge in order:
1. **Vendor** defaults shipped by packages via their `extra.config-plugin`;
2. **Root package** files under the application `config/`;
3. **Environment-specific** files (`environments/dev`, `/test`, `/prod` per APP_ENV).

Duplicate keys within one layer are an error. Later layers override earlier ones.

### Groups in configuration.php

```php
'config-plugin' => [
    'params' => 'common/params.php',
    'params-web' => ['$params', 'web/params.php'],
    'di' => 'common/di/*.php',
    'di-web' => ['$di', 'web/di/*.php'],
    'routes' => 'common/routes.php',
    'bootstrap' => 'common/bootstrap.php',
],
'config-plugin-environments' => [
    Environment::DEV => ['params' => ['environments/dev/params.php']],
],
```

Value syntax: string = single file; array = ordered merge; `?` = optional file; `*` = wildcard;
`$group` = reference another group. The `params` group is special — available as `$params`
in all config files.

### Directory Layout (default template)

```
config/
    common/{bootstrap,params,routes}.php   di/*.php
    console/params.php
    web/params.php                          di/*.php
    environments/{dev,test,prod}/params.php
    configuration.php
    .merge-plan.php                         # generated
```

### Params Conventions

```php
return [
    'application' => [...],                       // app-owned: no prefix
    'yiisoft/cache-file' => [...],                // package params grouped by package name
    'yiisoft/log-target-file' => [                // multi-service package: group by service
        'file-target' => [...], 'file-rotator' => [...],
    ],
    'yiisoft/yii-debug' => ['enabled' => true],   // enable/disable services via 'enabled'
];
```

**Rule:** do not read params/constants/env vars directly in application code — inject them into
services through DI definitions or typed params objects (`ApplicationParams` in the template).

### Service Providers

Alternative to direct definitions for reusable registration units:

```php
return [
    'yiisoft/cache/cache' => new CacheProvider($params['yiisoft/cache-file']['file-cache']['path']),
];
```

Provider implements `Yiisoft\Di\ServiceProviderInterface::getDefinitions()` (+ optional
`getExtensions()`). Prefer direct definitions for simple cases; providers when several related
services are registered together or reused across applications.

### Merge Plan Maintenance

- `.merge-plan.php` is generated — never edit manually.
- After adding config files/groups or changing `configuration.php`: `composer yii-config-rebuild`.
- Customize vendor config: copy into your `config/packages/` via `composer yii-config-copy` —
  it then belongs to the root layer and overrides vendor defaults.
- The `events` / `events-web` / `events-console` groups hold PSR-14 registrations (Part C above);
  the `routes` group can be extended with wildcards for modules.

## Part C: Events Wiring (PSR-14)

Decouple side effects from business logic with `yiisoft/event-dispatcher` (configured via
`yiisoft/yii-event`, included in app templates). Classic case: on `UserSignedUp` — send welcome
email, resize avatar — without bloating `SignupService`.

### Event Class

An immutable data carrier; name facts in past tense (`PostPublished`, not `PublishPost`):

```php
final readonly class UserSignedUp
{
    public function __construct(
        public SignupForm $form,
    ) {}
}

// related event families share an interface:
interface DocumentEvent {}
final readonly class AfterDocumentProcessed implements DocumentEvent {}
```

### Listeners

Prefer invokable classes (DI-instantiated, testable):

```php
final readonly class WelcomeEmailSender
{
    public function __construct(private MailerInterface $mailer) {}

    public function __invoke(UserSignedUp $event): void
    {
        // send welcome email
    }
}
```

Closure listeners may type-hint extra services after the event parameter — resolved from the container:

```php
static fn (UserSignedUp $event, AvatarProcessor $p): void => $p->resize($event->form),
```

### Registration in events Config

`config/events.php` (all), or `events-web.php` / `events-console.php` per context:

```php
return [
    UserSignedUp::class => [
        WelcomeEmailSender::class,
        static fn (UserSignedUp $event, AvatarProcessor $p): void => $p->resize($event->form),
    ],
];
```

Listeners run in listed order — prefer independent listeners; rely on order only for technical needs.

### Dispatching

Inject `Psr\EventDispatcher\EventDispatcherInterface` into the emitting service and dispatch the fact:

```php
$this->eventDispatcher->dispatch(new UserSignedUp($form));
```

Stoppable events implement `Psr\EventDispatcher\StoppableEventInterface`; the dispatcher stops when
`isPropagationStopped()` returns true.

### Event Guidelines

- Listener failures shouldn't corrupt the main flow — wrap risky side effects or queue them.
- Don't over-emit: events are for cross-cutting reactions, not internal method calls.
- Verify: trigger the flow and confirm each listener executed (log line per listener helps).
- Package authors ship event configs via `extra.config-plugin` (see yiisoft/config docs).

## Verify

1. `php -l` modified config files.
2. Confirm every interface key maps to a class that exists.
3. Boot the console app (`php yii` / `make yii`) to force container compilation — resolution
   errors surface immediately.
4. Never reference the container from application classes; inject dependencies instead.

## Related Skills

- `/yii3-email` — emails as event listeners
- `/yii3-actions` — DI wiring generated for actions and repositories
