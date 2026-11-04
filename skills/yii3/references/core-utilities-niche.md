# Yii3 Niche Utility Packages Guide

> [!IMPORTANT]
> **Grounding rule:** this guide is authoring synthesis for navigation and patterns. The source of truth for every class name, method signature, constructor argument, and configuration key is the installed package source under `vendor/yiisoft/<pkg>/src/`. Verify there before writing code; never substitute this guide for vendor sources, and never write Yii 2 APIs.

> Reference guide for four niche, rarely-needed standalone Yii3 utility packages: variable dumping and closure export (`yiisoft/var-dumper`), filesystem class discovery (`yiisoft/classifier`), network, DNS and CIDR firewall utilities (`yiisoft/network-utilities`), and deployment pre-flight verification (`yiisoft/requirements`). These packages are pure, framework-independent libraries — zero DI container wiring, no configuration plugins, and no static facades.

**Scope & Ownership:** This guide is the single source of truth for these four packages; it was extracted from the [Utility Packages Guide, §5–§8](core-utilities.md). Load this guide only when a task actually touches one of them — they are not part of the everyday core toolkit (`yiisoft/arrays`, `yiisoft/strings`, `yiisoft/json`, owned by the [Utility Packages Guide](core-utilities.md)).

**Mini package map:**
- `yiisoft/var-dumper` — debug output (`d()` / `dump()` / `dd()`), output handlers, and evaluatable PHP code export (§1)
- `yiisoft/classifier` — scans directories for user-defined classes by interface, parent, or attribute; CLI/build-time only (§2)
- `yiisoft/network-utilities` — IP validation, CIDR subnet math, DNS verification, and allowlist/denylist firewall rules (§3)
- `yiisoft/requirements` — pre-flight system capability verification for Docker, CI/CD pipelines, and deployment scripts (§4)

---

## Table of Contents
- [1. `yiisoft/var-dumper` — VarDumper & ClosureExporter](#1-yiisoftvar-dumper--vardumper--closureexporter)
  - [1.1. Debug Output & Global Helpers (d, dump, dd)](#11-debug-output--global-helpers-d-dump-dd)
  - [1.2. Handlers: Echo, Stream & Composite](#12-handlers-echo-stream--composite)
  - [1.3. Code Export and Closure Serialization](#13-code-export-and-closure-serialization)
- [2. `yiisoft/classifier` — Class Discovery](#2-yiisoftclassifier--class-discovery)
  - [2.1. Criteria Configuration & Scanning](#21-criteria-configuration--scanning)
  - [2.2. Execution Lifecycle & Performance Boundaries](#22-execution-lifecycle--performance-boundaries)
- [3. `yiisoft/network-utilities` — IpHelper, DnsHelper, IpRanges](#3-yiisoftnetwork-utilities--iphelper-dnshelper-ipranges)
  - [3.1. IpHelper: Validation & CIDR Math](#31-iphelper-validation--cidr-math)
  - [3.2. DnsHelper: MX, A Records & RFC 5321 Fallback](#32-dnshelper-mx-a-records--rfc-5321-fallback)
  - [3.3. IpRanges: Rule Matching, Aliases & Security Invariant](#33-ipranges-rule-matching-aliases--security-invariant)
- [4. `yiisoft/requirements` — Deployment & Environment Verification](#4-yiisoftrequirements--deployment--environment-verification)
  - [4.1. RequirementsChecker Architecture & Rule Schema](#41-requirementschecker-architecture--rule-schema)
  - [4.2. CLI Pre-Flight Check & CI/CD Docker Integration](#42-cli-pre-flight-check--cicd-docker-integration)
- [5. Anti-Patterns & Common Traps](#5-anti-patterns--common-traps)
- [Related Topic Guides](#related-topic-guides)

---

## 1. `yiisoft/var-dumper` — VarDumper & ClosureExporter

`yiisoft/var-dumper` serves two distinct purposes:
1. **Interactive Development Debugging:** Syntax-highlighted output, socket streaming (`StreamHandler`).
2. **Production Code Generation:** Evaluatable PHP export (`export()`), short array syntax `[...]`, and token-parsed closure extraction (`ClosureExporter`).

### 1.1. Debug Output & Global Helpers (d, dump, dd)

The package autoloads `src/functions.php`, exposing three global functions:

```php
declare(strict_types=1);

use Yiisoft\VarDumper\VarDumper;

// 1. d(...$vars) — Outputs dump with SAPI awareness (HTML <pre> in Web, ANSI in CLI)
d($order, $user);

// 2. dump(...$vars) — Exact alias of d(). Does NOT die!
dump($order);

// 3. dd(...$vars) — Outputs dump and immediately halts execution via die(0)
dd($order);

// Fluent instance methods
$plainString = VarDumper::create($user)->asString(depth: 5);
$jsonGraph   = VarDumper::create($user)->asJson(format: true, depth: 3);
$primitives  = VarDumper::create($user)->asPrimitives(depth: 2); // Inserts metadata ($__class__$, $__id__$)
```

> [!WARNING]
> **Signature Gotcha in `asString()`:** The static method `VarDumper::dump($var, depth: 10, highlight: true)` accepts a highlight boolean, but the instance method `VarDumper::create($var)->asString(int $depth = 10)` accepts **only one parameter** (`$depth`). Passing a second parameter throws a PHP 8 `ArgumentCountError`.

### 1.2. Handlers: Echo, Stream & Composite

Configure output destinations centrally during application bootstrap:

```php
declare(strict_types=1);

use Yiisoft\VarDumper\Handler\CompositeHandler;
use Yiisoft\VarDumper\Handler\EchoHandler;
use Yiisoft\VarDumper\Handler\StreamHandler;
use Yiisoft\VarDumper\VarDumper;

// Stream dumps over TCP/UDP to remote debug daemons or external tools
$streamHandler = new StreamHandler('tcp://127.0.0.1:9912');

// Fan out to multiple destinations
$composite = new CompositeHandler([
    new EchoHandler(),
    $streamHandler,
]);

// Note: setDefaultHandler parameter is strictly non-nullable
VarDumper::setDefaultHandler($composite);
```

### 1.3. Code Export and Closure Serialization

Unlike PHP's native `var_export()`, `VarDumper::export()` generates short `[...]` array syntax and serializes closures into syntactically valid PHP source code:

```php
declare(strict_types=1);

use DateTimeImmutable;
use Yiisoft\VarDumper\VarDumper;

$config = [
    'cache' => true,
    'calculator' => static fn (int $x): int => $x * 2,
    'date' => new DateTimeImmutable('2026-10-30T17:00:00+00:00'),
];

$phpCode = VarDumper::create($config)->export();
```

Generated PHP code output:
```php
[
    'cache' => true,
    'calculator' => static fn (int $x): int => $x * 2,
    'date' => new \DateTimeImmutable('2026-10-30T17:00:00.000+00:00', new \DateTimeZone('+00:00')),
]
```

#### Production Persistence Example: `yiisoft/rbac-php`
`yiisoft/rbac-php` relies on `VarDumper::export()` at runtime to persist RBAC authorization rules and role definitions to filesystem storage files:

```php
declare(strict_types=1);

use Yiisoft\VarDumper\VarDumper;

$storageData = [
    'rules' => [
        'isAuthor' => static fn ($user, $item) => $item->authorId === $user->getId(),
    ],
];

file_put_contents(
    '/path/to/rbac-storage.php',
    "<?php\n\ndeclare(strict_types=1);\n\nreturn " . VarDumper::create($storageData)->export() . ";\n",
    LOCK_EX
);
```

> [!CAUTION]
> **Anonymous Class Limitation:** Variables or properties that contain anonymous classes cannot be exported into evaluatable PHP code. `export()` falls back to a string literal representation.

> [!TIP]
> **RBAC Storage Reference:**
> For the full RBAC PHP file storage architecture — `yiisoft/rbac-php` file storages, concurrent-write decorators, and the `items.php` schema — see the [RBAC Storage Drivers Guide, §2](infra-rbac-storage.md#2-php-file-storage-yiisoftrbac-php).

---

## 2. `yiisoft/classifier` — Class Discovery

`Yiisoft\Classifier\Classifier` scans directories and discovers user-defined classes matching given interfaces, parent classes, or PHP 8 attributes.

### 2.1. Criteria Configuration & Scanning

```php
declare(strict_types=1);

use App\Attribute\AsCommandHandler;
use App\Command\CommandInterface;
use Yiisoft\Classifier\Classifier;

$finder = (new Classifier('src/Command', 'src/Module/*/Command'))
    ->withInterface(CommandInterface::class)
    ->withAttribute(AsCommandHandler::class);

/** @var class-string<CommandInterface> $commandClass */
foreach ($finder->find() as $commandClass) {
    // $commandClass is a fully qualified class name string: 'App\Command\CreateUserCommand'
}
```

### 2.2. Execution Lifecycle & Performance Boundaries

1. **AND Combination:** All configured filters (`withInterface`, `withParentClass`, `withAttribute`) are combined with **AND** logic. A class must satisfy every condition.
2. **Empty Filter Guard:** Calling `find()` without configuring any criteria returns an empty array `[]` immediately.
3. **Filter Scope:** Returns only user-defined classes (`$reflection->isUserDefined()`) located in the specified directories.

> [!WARNING]
> **Implementation Heavy Side-Effect:** To inspect classes via reflection, `Classifier::find()` runs `Symfony\Component\Finder\Finder` and calls `require_once` on **every single `*.php` file** found in the target directories.
>
> **Architectural Invariant:** Never invoke `Classifier::find()` inside per-request web controllers or middleware! Invoke `Classifier` exclusively within **CLI console commands, build-time compilation scripts, or deployment cache-warming routines**. Cache the discovered class-string list into a PHP or JSON cache file.

---

## 3. `yiisoft/network-utilities` — IpHelper, DnsHelper, IpRanges

`yiisoft/network-utilities` is a zero-dependency package providing IP validation, CIDR subnet matching, DNS verification, and allowlist/denylist firewall evaluations.

### 3.1. IpHelper: Validation & CIDR Math

```php
declare(strict_types=1);

use Yiisoft\NetworkUtilities\IpHelper;

// IP Validation
IpHelper::isIp('192.168.1.1'); // true
IpHelper::isIpv4('192.168.1.1'); // true
IpHelper::isIpv6('2001:db8::1'); // true

// Detect Protocol Version (Returns IpHelper::IPV4 = 4 or IpHelper::IPV6 = 6)
$version = IpHelper::getIpVersion('192.168.1.1'); // 4

// CIDR Subnet Containment (Accepts single IPs or subnets)
IpHelper::inRange('192.168.1.25', '192.168.1.0/24'); // true
IpHelper::inRange('192.168.1.0/24', '192.168.0.0/16'); // true
IpHelper::inRange('10.0.0.1', '192.168.0.0/16');       // false

// IPv6 Normalization (Expands to 8 full 16-bit zero-padded groups)
IpHelper::expandIPv6('2001:db8::1');
// Returns: '2001:0db8:0000:0000:0000:0000:0000:0001'

// Low-level bit string conversions
$bitString = IpHelper::ip2bin('192.168.1.1'); // 32-character binary string of 0s and 1s
$cidrBits  = IpHelper::getCidrBits('192.168.1.0/24'); // 24
```

### 3.2. DnsHelper: MX, A Records & RFC 5321 Fallback

```php
declare(strict_types=1);

use RuntimeException;
use Yiisoft\NetworkUtilities\DnsHelper;

try {
    // Validates if domain has MX records configured
    $hasMx = DnsHelper::existsMx('yiiframework.com');

    // Validates if domain has IPv4 A records
    $hasA = DnsHelper::existsA('yiiframework.com');

    // RFC 5321 §5 Email Capability Check:
    // Automatically checks MX record; if absent, falls back to checking A record
    $accepts = DnsHelper::acceptsEmails('support@yiiframework.com');
} catch (RuntimeException $e) {
    // DnsHelper captures PHP warnings and wraps lookup failures in RuntimeException
}
```

### 3.3. IpRanges: Rule Matching, Aliases & Security Invariant

`IpRanges` evaluates incoming IP addresses against configured allow/deny lists.

```php
declare(strict_types=1);

use Yiisoft\NetworkUtilities\IpRanges;

$firewall = new IpRanges(
    ranges: [
        '10.0.1.0/24',          // Subnet allow rule
        '192.168.1.50',         // Single IP allow rule
        'corpVpn',              // Custom alias
        IpRanges::LOCALHOST,    // Built-in alias: '127.0.0.0/8', '::1'
        '!' . IpRanges::ANY,    // Catch-all DENY rule (must be placed at the end!)
    ],
    networks: [
        'corpVpn' => ['198.51.100.0/26', '203.0.113.10'],
    ]
);

$firewall->isAllowed('10.0.1.15'); // true
$firewall->isAllowed('192.168.1.50'); // true
$firewall->isAllowed('127.0.0.1');    // true
$firewall->isAllowed('8.8.8.8');      // false (matches '!' . IpRanges::ANY)
```

#### RFC 5735 Built-in Aliases
`IpRanges` provides standard alias constants that cannot be overwritten in `$networks`:
- `IpRanges::ANY` (`'any'`): `0.0.0.0/0`, `::/0`
- `IpRanges::LOCALHOST` (`'localhost'`): `127.0.0.0/8`, `::1`
- `IpRanges::PRIVATE` (`'private'`): `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `fd00::/8`
- `IpRanges::LINK_LOCAL` (`'linklocal'`): `169.254.0.0/16`, `fe80::/10`
- `IpRanges::MULTICAST` (`'multicast'`): `224.0.0.0/4`, `ff00::/8`
- `IpRanges::DOCUMENTATION` (`'documentation'`): `192.0.2.0/24`, `198.51.100.0/24`, `203.0.113.0/24`, `2001:db8::/32`
- `IpRanges::SYSTEM` (`'system'`): Aggregates localhost, private, linklocal, multicast, documentation.

> [!CAUTION]
> **CRITICAL SECURITY GOTCHA: Empty `$ranges` Defaults to ALLOW ALL!**
> In `IpRanges::isAllowed()`:
> ```php
> if (empty($this->ranges)) {
>     return true;
> }
> ```
> If an application dynamically configures allowed admin IPs from an environment variable (e.g. `explode(',', (string) getenv('ADMIN_IPS'))`), and that environment variable is unset or empty, **`$ranges` evaluates to an empty array and grants access to every IP address on the Internet!**
>
> **Mandatory Protection Pattern:**
> Always verify that configured ranges are non-empty, or explicitly append a trailing deny-all rule:
> ```php
> $ranges = array_filter(explode(',', (string) getenv('ADMIN_IPS')));
> if (empty($ranges)) {
>     throw new RuntimeException('No admin IPs configured. Access closed.');
> }
> $ranges[] = '!' . IpRanges::ANY;
> $firewall = new IpRanges($ranges);
> ```

---

## 4. `yiisoft/requirements` — Deployment & Environment Verification

`yiisoft/requirements` (`Yiisoft\Requirements\RequirementsChecker`) is a framework-independent pre-flight diagnostic utility designed for Docker container startup, CI/CD validation pipelines, and application deployment scripts. Install it as a dev dependency (`composer require --dev`) when it is only used in development/CI tooling; require it as a regular dependency if production startup or deployment checks invoke it (e.g., Docker container entrypoints).

### 4.1. RequirementsChecker Architecture & Rule Schema

The checker accepts an array of requirement specifications (or a filepath returning an array). It evaluates each rule and classifies issues as mandatory errors or non-mandatory warnings:

| Rule Key | Type | Requirement Level | Description & Semantics |
|---|---|---|---|
| `'condition'` | `bool\|string` | **Mandatory** | Boolean result or expression. If prefixed with `'eval:'`, evaluated in the context of the checker via `eval()`. |
| `'name'` | `string` | Optional | Descriptive label. Defaults to `'Requirement #N'`. |
| `'mandatory'` | `bool` | Optional | If `true`, failure increments `errors` count. If `false`, increments `warnings`. Defaults to `false`. |
| `'by'` | `string` | Optional | Component or feature requiring this setting (e.g. `'Framework Core'`, `'RBAC'`). Defaults to `'Unknown'`. |
| `'memo'` | `string` | Optional | Remediation instructions explaining how to resolve the failure. |

#### Built-in Environment Evaluators
The class provides built-in helper methods that can be referenced in `'eval:'` expressions or executed directly:
- `checkPhpExtensionVersion(string $extensionName, string $version, string $compare = '>='): bool`
- `checkPhpIniOn(string $name): bool` (verifies setting is `'1'` or `'on'`)
- `checkPhpIniOff(string $name): bool` (verifies setting is `'0'`, `''`, or `'off'`)
- `compareByteSize(string $a, string $b, string $compare = '>='): bool`
- `checkUploadMaxFileSize(?string $min = null, ?string $max = null): bool`

### 4.2. CLI Pre-Flight Check & CI/CD Docker Integration

```php
declare(strict_types=1);

use Yiisoft\Requirements\RequirementsChecker;

$checker = new RequirementsChecker();

$requirements = [
    [
        'name' => 'PHP Version',
        'mandatory' => true,
        'condition' => version_compare(PHP_VERSION, '8.2.0', '>='),
        'by' => 'Yii3 Application Runtime',
        'memo' => 'PHP 8.2 or higher is required.',
    ],
    [
        'name' => 'Multibyte String Extension',
        'mandatory' => true,
        'condition' => extension_loaded('mbstring'),
        'by' => 'yiisoft/strings',
        'memo' => 'Install and enable ext-mbstring in php.ini.',
    ],
    [
        'name' => 'Intl Extension',
        'mandatory' => false,
        'condition' => extension_loaded('intl'),
        'by' => 'Slug Transliteration',
        'memo' => 'Recommended for robust Unicode slug generation.',
    ],
    [
        'name' => 'Upload Max Filesize',
        'mandatory' => true,
        'condition' => 'eval:$this->checkUploadMaxFileSize("10M")',
        'by' => 'Document Attachment Uploads',
        'memo' => 'upload_max_filesize and post_max_size must be at least 10M.',
    ],
];

// Execute check suite
$checker->check($requirements);

// Auto-detects CLI (ANSI colored table) vs Web (HTML report)
$checker->render();

// Extract structured result for exit code determination
$result = $checker->getResult();

// Standard CI/CD Exit Code Contract: Return 0 on success, 1 on mandatory error
$exitCode = ($result !== null && $result['summary']['errors'] === 0) ? 0 : 1;
exit($exitCode);
```

---

## 5. Anti-Patterns & Common Traps

| # | Forbidden Anti-Pattern | Why It Breaks / Production Consequences | Idiomatic Yii3 Solution |
|---|---|---|---|
| 1 | **Calling `VarDumper::create()->asString(10, true)` with two arguments** | `asString(int $depth = 10)` accepts only one argument (unlike static `dump()`). Passing two arguments triggers `ArgumentCountError`. | Call `VarDumper::create($data)->asString(depth: 10)` with the single depth argument. |
| 2 | **Assuming `dump()` terminates script execution** | In Yii3, `dump()` is an alias of `d()`. It outputs the dump and continues execution; it does not halt. | Use `dd(...$vars)` if script termination via `die(0)` is required. |
| 3 | **Passing `null` to `VarDumper::setDefaultHandler(?HandlerInterface $handler)`** | Parameter `$handler` is strictly typed `HandlerInterface` (non-nullable). Passing `null` causes a fatal `TypeError`. | Provide a valid handler instance, such as `new EchoHandler()` or `new StreamHandler()`. |
| 4 | **Running `Classifier::find()` in per-request web controller actions** | `Classifier` traverses files and executes `require_once` on every PHP file, causing massive per-request I/O latency. | Execute `Classifier` only in console commands or deployment build steps; cache discovered class lists. |
| 5 | **Assuming `IpRanges` with an empty rules array denies access** | When `$ranges` is empty, `isAllowed()` defaults to `true`, granting access to every IP address on the Internet! | Guard against empty range arrays, and always append a trailing catch-all deny rule: `'!' . IpRanges::ANY`. |

---

## Related Topic Guides

- [Utility Packages Guide](core-utilities.md) — Core everyday helpers: `ArrayHelper`, `StringHelper`, `NumericHelper`, `CombinedRegexp`, and exception-safe `Json`.
- [Friendly Exceptions Guide](core-friendly-exceptions.md) — Actionable error solution contract (`FriendlyExceptionInterface`) with automatic web and console rendering.
- [Architecture Alignment Guide](core-architecture-alignment.md) — Architectural placement of utility packages, static helper boundaries, and domain adapter encapsulation.
- [RBAC Storage Drivers Guide](infra-rbac-storage.md) — RBAC permission rules and role definitions persisted to PHP files via `VarDumper::export()`.
- [PSR-15 Middlewares Guide](http-middlewares.md) — Enforcing network security guards, trusted proxy subnets, and IP allowlists via `IpRanges`.
- [Console Commands Guide](infra-commands.md) — Authoring console commands that execute build-time `Classifier` scanning and `RequirementsChecker` pre-flight diagnostics.
- [Caching Guide](persistence-caching.md) — Caching discovered class lists, reflection metadata, and compiled regular expression match tables.
- [File Handling Guide](http-file-handling.md) — Filesystem operations via `yiisoft/files` (`FileHelper`), stream responses, and secure file uploads.
