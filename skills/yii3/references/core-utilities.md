# Yii3 Utility Packages Guide

> Comprehensive guide to the official Yii3 standalone utility packages: array manipulation (`yiisoft/arrays`), string, inflector and regex helpers (`yiisoft/strings`), exception-safe JSON (`yiisoft/json`), variable dumping and closure export (`yiisoft/var-dumper`), filesystem class discovery (`yiisoft/classifier`), network, DNS and CIDR firewall utilities (`yiisoft/network-utilities`), deployment pre-flight verification (`yiisoft/requirements`), and actionable developer exception contracts (`yiisoft/friendly-exception`). These packages are pure, framework-independent libraries — zero DI container wiring, no configuration plugins, and no static facades.

---

## Table of Contents
- [1. Overview & Package Map](#1-overview--package-map)
- [2. `yiisoft/arrays` — ArrayHelper, ArraySorter, Arrayable & ArrayAccessTrait](#2-yiisoftarrays--arrayhelper-arraysorter-arrayable--arrayaccesstrait)
  - [2.1. Getting, Setting & Removing Values (Direct and By-Path)](#21-getting-setting--removing-values-direct-and-by-path)
  - [2.2. Complete 27-Method Surface of ArrayHelper](#22-complete-27-method-surface-of-arrayhelper)
  - [2.3. Transformations: index, group, map, filter, merge](#23-transformations-index-group-map-filter-merge)
  - [2.4. Type Checks, Membership & HTML Encoding](#24-type-checks-membership--html-encoding)
  - [2.5. ArraySorter, Arrayable & ArrayAccessTrait](#25-arraysorter-arrayable--arrayaccesstrait)
- [3. `yiisoft/strings` — StringHelper, Inflector, NumericHelper, Regex](#3-yiisoftstrings--stringhelper-inflector-numerichelper-regex)
  - [3.1. StringHelper (32 UTF-8 Safe Methods)](#31-stringhelper-32-utf-8-safe-methods)
  - [3.2. Inflector: Case, Slugs, Pluralization, Transliteration](#32-inflector-case-slugs-pluralization-transliteration)
  - [3.3. NumericHelper: Ordinals, Sizing, Normalization](#33-numerichelper-ordinals-sizing-normalization)
  - [3.4. CombinedRegexp & WildcardPattern](#34-combinedregexp--wildcardpattern)
- [4. `yiisoft/json` — Safe JSON Handling](#4-yiisoftjson--safe-json-handling)
  - [4.1. Invariant: Exception-Safe Encoding & Decoding](#41-invariant-exception-safe-encoding--decoding)
  - [4.2. XSS Prevention with htmlEncode()](#42-xss-prevention-with-htmlencode)
  - [4.3. Type Preprocessing: Enums, Dates, Traversables & Objects](#43-type-preprocessing-enums-dates-traversables--objects)
- [5. `yiisoft/var-dumper` — VarDumper & ClosureExporter](#5-yiisoftvar-dumper--vardumper--closureexporter)
  - [5.1. Debug Output & Global Helpers (d, dump, dd)](#51-debug-output--global-helpers-d-dump-dd)
  - [5.2. Handlers: Echo, Stream & Composite](#52-handlers-echo-stream--composite)
  - [5.3. Code Export and Closure Serialization](#53-code-export-and-closure-serialization)
- [6. `yiisoft/classifier` — Class Discovery](#6-yiisoftclassifier--class-discovery)
  - [6.1. Criteria Configuration & Scanning](#61-criteria-configuration--scanning)
  - [6.2. Execution Lifecycle & Performance Boundaries](#62-execution-lifecycle--performance-boundaries)
- [7. `yiisoft/network-utilities` — IpHelper, DnsHelper, IpRanges](#7-yiisoftnetwork-utilities--iphelper-dnshelper-ipranges)
  - [7.1. IpHelper: Validation & CIDR Math](#71-iphelper-validation--cidr-math)
  - [7.2. DnsHelper: MX, A Records & RFC 5321 Fallback](#72-dnshelper-mx-a-records--rfc-5321-fallback)
  - [7.3. IpRanges: Rule Matching, Aliases & Security Invariant](#73-ipranges-rule-matching-aliases--security-invariant)
- [8. `yiisoft/requirements` — Deployment & Environment Verification](#8-yiisoftrequirements--deployment--environment-verification)
  - [8.1. RequirementsChecker Architecture & Rule Schema](#81-requirementschecker-architecture--rule-schema)
  - [8.2. CLI Pre-Flight Check & CI/CD Docker Integration](#82-cli-pre-flight-check--cicd-docker-integration)
- [9. `yiisoft/friendly-exception` — Actionable Error Solution Contract](#9-yiisoftfriendly-exception--actionable-error-solution-contract)
  - [9.1. Interface Contract & Markdown Invariant](#91-interface-contract--markdown-invariant)
  - [9.2. Implementation Recipe & Ecosystem Handlers](#92-implementation-recipe--ecosystem-handlers)
- [10. Placement in Yii3 Architecture](#10-placement-in-yii3-architecture)
- [11. Anti-Pattern Matrix](#11-anti-pattern-matrix)
- [12. Related Topic Guides](#12-related-topic-guides)

---

## 1. Overview & Package Map

Yii3 decomposes monolithic framework helpers into focused, independent packages. Every package in this guide operates without framework glue code: they contain **no `config/` directory, no config-plugin extensions, and no DI service definitions**. Exception handling relies exclusively on standard PHP SPL exceptions (`InvalidArgumentException`, `RuntimeException`, `JsonException`) or dedicated clean contracts (`FriendlyExceptionInterface`).

| Package | Composer Command | Key Classes & Contracts | Primary Purpose & Key Details |
|---|---|---|---|
| `yiisoft/arrays` | `composer require yiisoft/arrays` | `ArrayHelper`, `ArraySorter`, `ArrayableInterface`, `ArrayableTrait`, `ArrayAccessTrait` | Nested array access, direct/by-path mutations, stable sorting, data transformations. Direct Composer requirement on `"yiisoft/strings": "^2.6"`. |
| `yiisoft/strings` | `composer require yiisoft/strings` | `StringHelper`, `Inflector`, `NumericHelper`, `CombinedRegexp`, `MemoizedCombinedRegexp`, `WildcardPattern` | Multibyte UTF-8 operations, pluralization, case conversions, slug generation, branch-reset regex optimizations. Requires `ext-mbstring`; recommends `ext-intl`. |
| `yiisoft/json` | `composer require yiisoft/json` | `Json` | Exception-safe JSON codec (`JSON_THROW_ON_ERROR`). Deliberate XSS defense via `htmlEncode()`; native PHP 8.1+ `BackedEnum` support. |
| `yiisoft/var-dumper` | `composer require yiisoft/var-dumper` | `VarDumper`, `ClosureExporter`, `EchoHandler`, `StreamHandler`, `CompositeHandler`, `d()`, `dd()`, `dump()` | Dual role: developer debugging (console/web/socket) and runtime code generation (short `[]` export and token-based closure extraction used by `yiisoft/rbac-php`). |
| `yiisoft/classifier` | `composer require yiisoft/classifier` | `Classifier` | Scans directories for user-defined classes by interface, parent, or attribute using `symfony/finder`. For console/build steps only. |
| `yiisoft/network-utilities` | `composer require yiisoft/network-utilities` | `IpHelper`, `DnsHelper`, `IpRanges` | Zero-dependency IP/CIDR math, RFC 5321 DNS email verification, first-match IP firewall rules with RFC 5735 network aliases. |
| `yiisoft/requirements` | `composer require [--dev] yiisoft/requirements` — typically `--dev`; require as a regular dependency if used in production startup/deployment checks | `RequirementsChecker` | Pre-flight system capability verification. Structured rule evaluation, `'eval:'` expressions, automated CLI (ANSI) / Web (HTML) rendering. |
| `yiisoft/friendly-exception` | `composer require yiisoft/friendly-exception` | `FriendlyExceptionInterface` | Cross-cutting contract defining `getName()` and `getSolution()`. Rendered automatically by `yiisoft/error-handler` and `yiisoft/yii-console`. |

Two closely related packages are documented in dedicated guides:
- `yiisoft/files` (`FileHelper`) in [File Handling Guide](http-file-handling.md).
- `yiisoft/aliases` (`Aliases`) in [DI & Configuration Guide](core-di-and-config.md).

---

## 2. `yiisoft/arrays` — ArrayHelper, ArraySorter, Arrayable & ArrayAccessTrait

`Yiisoft\Arrays\ArrayHelper` is a `final` class containing 27 static helper methods. It requires `"yiisoft/strings": "^2.6"` directly to power delimited path operations.

### 2.1. Getting, Setting & Removing Values (Direct and By-Path)

> [!IMPORTANT]
> **Dot-Path Rule:** `ArrayHelper::getValue()` checks for a **literal** string key (e.g. `$data['post.author.name']`). It does **not** split strings on dots. To read nested data via delimited strings, you **must** call `ArrayHelper::getValueByPath()` or pass a key array `['post', 'author', 'name']`.

```php
declare(strict_types=1);

use Yiisoft\Arrays\ArrayHelper;

$data = [
    'post' => [
        'author' => [
            'name' => 'Alexander',
        ],
        'tags' => ['php', 'yii3'],
    ],
    'db.name' => 'production_db', // Literal key containing a dot
];

// 1. Reading via Delimited String Path (delimiter defaults to '.')
$author = ArrayHelper::getValueByPath($data, 'post.author.name', default: 'Anonymous'); // 'Alexander'

// 2. Reading via Key Sequence Array
$author = ArrayHelper::getValue($data, ['post', 'author', 'name'], default: 'Anonymous'); // 'Alexander'

// 3. Reading a Literal Key containing dots
$dbName = ArrayHelper::getValue($data, 'db.name'); // 'production_db'

// 4. Reading a Key containing an escaped delimiter via ByPath
$dbName = ArrayHelper::getValueByPath($data, 'db\.name'); // 'production_db'

// 5. Reading with Object Method Call Syntax (suffix '()')
$user = new class {
    public function getUsername(): string { return 'samdark'; }
};
$username = ArrayHelper::getValue($user, 'getUsername()', default: 'guest'); // 'samdark'

// 6. Mutating by Reference via Path
ArrayHelper::setValueByPath($data, 'post.author.name', 'Dmitry');
ArrayHelper::addValueByPath($data, 'post.tags', 'framework'); // Appends to existing array
$removed = ArrayHelper::removeByPath($data, 'post.author.name'); // Returns 'Dmitry'
$exists  = ArrayHelper::pathExists($data, 'post.author'); // true
```

> [!WARNING]
> **Object Default Warning:** When reading properties from objects (`is_object($target)`), if the property does not exist and the object does not implement `__get()`, PHP 8.2+ emits `Warning: Undefined property` and returns `null`. The `$default` parameter is only returned for array lookups, not for missing object properties.

### 2.2. Complete 27-Method Surface of ArrayHelper

| Method Name & Signature | Return Type | Mutation & Semantics |
|---|---|---|
| `getValue(array\|object $array, array\|Closure\|float\|int\|string $key, mixed $default = null)` | `mixed` | Read-only. If `$key` is array, traverses hierarchy. If string, looks up literal key `$array[$key]`. |
| `getValueByPath(array\|object $array, array\|Closure\|float\|int\|string $path, mixed $default = null, string $delimiter = '.')` | `mixed` | Read-only. Splits string path using `StringHelper::parsePath()` and traverses nested keys. Supports `\.` escaping. |
| `setValue(array &$array, array\|float\|int\|string\|null $key, mixed $value): void` | `void` | **Mutates by reference**. If `$key === null`, overwrites `$array = $value`. |
| `setValueByPath(array &$array, array\|float\|int\|string\|null $path, mixed $value, string $delimiter = '.'): void` | `void` | **Mutates by reference**. Creates nested intermediate arrays along `$path` as needed. |
| `addValue(array &$array, array\|float\|int\|string\|null $key, mixed $value): void` | `void` | **Mutates by reference**. Appends `$value`. Converts existing scalar target to an array first. |
| `addValueByPath(array &$array, array\|float\|int\|string\|null $path, mixed $value, string $delimiter = '.'): void` | `void` | **Mutates by reference**. Path-based variant of `addValue()`. |
| `remove(array &$array, array\|float\|int\|string $key, mixed $default = null): mixed` | `mixed` | **Mutates by reference**. Unsets element at `$key` and returns its previous value, or `$default`. |
| `removeByPath(array &$array, array\|float\|int\|string $path, mixed $default = null, string $delimiter = '.'): mixed` | `mixed` | **Mutates by reference**. Path-based removal of nested keys. |
| `removeValue(array &$array, mixed $value): array` | `array` | **Mutates by reference**. Removes all key-value pairs where `$v === $value`. Returns removed `[key => value]` pairs. |
| `renameKey(array $array, int\|string $from, int\|string $to): array` | `array` | **Immutable**. Returns a **new array** with renamed key, preserving existing key order. |
| `keyExists(array $array, array\|float\|int\|string $key, bool $caseSensitive = true): bool` | `bool` | Checks key existence. Case-insensitive lookup via `strcasecmp` when `$caseSensitive = false`. |
| `pathExists(array $array, array\|float\|int\|string $path, bool $caseSensitive = true, string $delimiter = '.'): bool` | `bool` | Checks path existence across nested keys. |
| `getObjectVars(object $object): array` | `array` | Returns strictly **public** properties, guaranteed even when called from inside object's private methods. |
| `index(iterable $array, Closure\|string\|null $key, array\|string\|null $groups = []): array` | `array` | Re-indexes or multi-level groups collections. Throws `InvalidArgumentException` on scalar items. |
| `group(iterable $array, array\|string $groups): array` | `array` | Shorthand alias for `index($array, null, $groups)`. |
| `getColumn(iterable $array, Closure\|string $name, bool $keepKeys = true): array` | `array` | Extracts column values. If `$keepKeys = false`, returns a 0-indexed list. |
| `map(iterable $array, Closure\|string $from, Closure\|string $to, Closure\|string\|null $group = null): array` | `array` | Builds key-value map. Optimizes to `array_column` when keys are plain strings and input is an array. |
| `filter(array $array, array $filters): array` | `array` | **Immutable**. Two-phase filtering: positive whitelisting first, followed by `'!'` blacklisting. |
| `merge(...$arrays): array` | `array` | **Immutable**. Recursive merge: string keys overwrite; integer keys append (identical integer values are deduplicated). |
| `parametrizedMerge(array $arrays, ?int $depth): array` | `array` | **Immutable**. Recursive merge with maximum recursion depth limiter. |
| `toArray(mixed $object, array $properties = [], bool $recursive = true): array` | `array` | Converts object or iterable into array. Respects `ArrayableInterface`. |
| `isAssociative(array $array, bool $allStrings = true): bool` | `bool` | Checks if array is associative. Empty array returns `false`. |
| `isIndexed(array $array, bool $consecutive = false): bool` | `bool` | Checks if array is indexed. `$consecutive = true` verifies sequential 0-based keys (`array_is_list()`). |
| `isIn(mixed $needle, iterable $haystack, bool $strict = false): bool` | `bool` | Checks needle presence in array or traversable collection. |
| `isSubset(iterable $needles, iterable $haystack, bool $strict = false): bool` | `bool` | Checks if every item in `$needles` exists in `$haystack`. |
| `htmlEncode(iterable $data, bool $valuesOnly = true, ?string $encoding = null): array` | `array` | Recursively encodes HTML entities. Defaults to **values only** (`$valuesOnly = true`). |
| `htmlDecode(iterable $data, bool $valuesOnly = true): array` | `array` | Recursively decodes HTML entities. Defaults to **values only** (`$valuesOnly = true`). |

### 2.3. Transformations: index, group, map, filter, merge

```php
declare(strict_types=1);

use Yiisoft\Arrays\ArrayHelper;

$users = [
    ['id' => 101, 'role' => 'admin', 'name' => 'Alice', 'email' => 'alice@example.com'],
    ['id' => 102, 'role' => 'editor', 'name' => 'Bob', 'email' => 'bob@example.com'],
    ['id' => 103, 'role' => 'admin', 'name' => 'Charlie', 'email' => 'charlie@example.com'],
];

// Re-index by column or closure
$byId = ArrayHelper::index($users, 'id');

// Group rows by column into nested buckets
$byRole = ArrayHelper::group($users, 'role');
// Returns: ['admin' => [Alice, Charlie], 'editor' => [Bob]]

// Extract single column (keepKeys: false produces a 0-indexed sequential list)
$emails = ArrayHelper::getColumn($users, 'email', keepKeys: false);
// Returns: ['alice@example.com', 'bob@example.com', 'charlie@example.com']

// Build key-value map (with optional third grouping argument)
$map = ArrayHelper::map($users, 'id', 'name', 'role');
// Returns: ['admin' => [101 => 'Alice', 103 => 'Charlie'], 'editor' => [102 => 'Bob']]
```

#### Two-Phase Filtering in `ArrayHelper::filter()`
`ArrayHelper::filter(array $array, array $filters)` applies a strict two-phase evaluation:
1. **Phase 1 (Whitelisting):** Extracts keys listed without `'!'`. If no positive filters are provided, the whitelist is empty (`[]`).
2. **Phase 2 (Exclusion):** Unsets keys prefixed with `'!'`.

```php
declare(strict_types=1);

use Yiisoft\Arrays\ArrayHelper;

$payload = [
    'name' => 'Yii Guide',
    'status' => 'draft',
    'secret_token' => 'x9a8f7',
    'metadata' => [
        'author' => 'Alexander',
        'ip' => '127.0.0.1',
    ],
];

// Correct: Whitelist top-level keys, then exclude sensitive sub-keys
$clean = ArrayHelper::filter($payload, [
    'name',
    'status',
    'metadata',
    '!metadata.ip',
]);

// Gotcha Warning: Passing ONLY negative rules produces an empty array []!
$wrong = ArrayHelper::filter($payload, ['!secret_token']); // Returns []!
```

### 2.4. Type Checks, Membership & HTML Encoding

```php
declare(strict_types=1);

use Yiisoft\Arrays\ArrayHelper;

ArrayHelper::isAssociative(['a' => 1, 'b' => 2]); // true
ArrayHelper::isAssociative([]); // false (empty array is not associative)

ArrayHelper::isIndexed([0 => 'apple', 1 => 'banana'], consecutive: true); // true (uses array_is_list)
ArrayHelper::isIndexed([]); // true

ArrayHelper::isIn('admin', ['admin', 'manager'], strict: true); // true
ArrayHelper::isSubset(['read', 'write'], ['read', 'write', 'execute']); // true

$input = [
    'title' => '<script>alert(1)</script>',
    'tag' => '<b>safe</b>',
];

// Encodes VALUES only by default ($valuesOnly = true)
$safeValues = ArrayHelper::htmlEncode($input);

// Encodes both KEYS and VALUES explicitly
$safeBoth = ArrayHelper::htmlEncode($input, valuesOnly: false);
```

### 2.5. ArraySorter, Arrayable & ArrayAccessTrait

`Yiisoft\Arrays\ArraySorter` provides stable multi-column sorting:

```php
declare(strict_types=1);

use Yiisoft\Arrays\ArraySorter;

$records = [
    ['priority' => 1, 'name' => 'Charlie'],
    ['priority' => 2, 'name' => 'Alice'],
    ['priority' => 1, 'name' => 'Bob'],
];

// Multisort mutates $records BY REFERENCE.
// Appends range(1, count($array)) as an internal tie-breaker for deterministic stability.
ArraySorter::multisort(
    $records,
    ['priority', 'name'],
    [SORT_ASC, SORT_ASC]
);
```

#### Complete Collection Implementation with `ArrayAccessTrait`
When creating custom DTOs or collection models, use `ArrayAccessTrait` along with SPL interfaces:

```php
declare(strict_types=1);

namespace App\Collection;

use ArrayAccess;
use Countable;
use IteratorAggregate;
use Yiisoft\Arrays\ArrayAccessTrait;

/**
 * @implements IteratorAggregate<string, mixed>
 * @implements ArrayAccess<string, mixed>
 */
final class ParameterBag implements IteratorAggregate, ArrayAccess, Countable
{
    use ArrayAccessTrait;

    /**
     * ArrayAccessTrait expects property $data to exist in the host class.
     *
     * @param array<string, mixed> $data
     */
    public function __construct(private array $data = [])
    {
    }

    public function all(): array
    {
        return $this->data;
    }
}
```

---

## 3. `yiisoft/strings` — StringHelper, Inflector, NumericHelper, Regex

The `yiisoft/strings` package requires `ext-mbstring` and provides UTF-8 safe text processing. All concrete helper classes are declared `final`.

### 3.1. StringHelper (32 UTF-8 Safe Methods)

```php
declare(strict_types=1);

use Yiisoft\Strings\StringHelper;

// Byte-level vs Character-level lengths
$text = 'Привет';
StringHelper::byteLength($text); // 12 bytes (via mb_strlen($text, '8bit'))
mb_strlen($text, 'UTF-8');       // 6 characters

// Character slicing & replacement
StringHelper::substring($text, 0, 3); // 'При'
StringHelper::replaceSubstring('Hello World', 'Yii', 6, 5); // 'Hello Yii'

// Safe path navigation (normalizes '/' and '\' on all operating systems)
StringHelper::baseName('App\\Controller\\SiteController', 'Controller'); // 'Site'
StringHelper::directoryName('src/Service/OrderProcessor.php');           // 'src/Service'

// Prefix and suffix matching
StringHelper::startsWith('https://yiiframework.com', 'https://'); // true
StringHelper::endsWithIgnoringCase('photo.JPG', '.jpg');           // true

// Truncation (Defaults to '…' marker. Note: $asHtml parameter does NOT exist in Yii3!)
StringHelper::truncateBegin('Very long content string', length: 14); // '…ontent string'
StringHelper::truncateMiddle('Long file description header', length: 15); // 'Long f… header'
StringHelper::truncateEnd('Detailed product description', length: 10); // 'Detailed p…'
StringHelper::truncateWords('Three blind mice went to town', count: 3); // 'Three blind mice…'
StringHelper::truncateWordsByLength('Alpha Beta Gamma Delta', length: 14); // 'Alpha Beta…'

// Delimited path parser with delimiter backslash-escaping
StringHelper::parsePath('config.database\.credentials.password');
// Returns: ['config', 'database.credentials', 'password']

// Unicode whitespace trim (\pC\pZ characters including zero-width spaces)
StringHelper::trim(" \u{200B}Hello World \t\n"); // 'Hello World'

// Substring boundary extraction
StringHelper::findBetween('Config: <param>db_user</param> OK', '<param>', '</param>'); // 'db_user'
```

### 3.2. Inflector: Case, Slugs, Pluralization, Transliteration

`Yiisoft\Strings\Inflector` is an **immutable** service object. Every configuration method returns a cloned instance.

```php
declare(strict_types=1);

use Yiisoft\Strings\Inflector;

$inflector = new Inflector();

// Identifier & Case Conversions
$inflector->toPascalCase('user-profile-setting'); // 'UserProfileSetting' (Inverse of pascalCaseToId)
$inflector->toCamelCase('user-profile-setting');  // 'userProfileSetting'
$inflector->toSnakeCase('UserProfileSetting');   // 'user_profile_setting'
$inflector->toHumanReadable('user_id');          // 'user'
$inflector->toSentence('user_first_name');       // 'User first name'
$inflector->toWords('UserAddressDTO');           // 'User Address DTO'
$inflector->pascalCaseToId('UserProfileSetting'); // 'user-profile-setting'

// Database Table <-> Class Name Conventions
$inflector->classToTable('App\\Entity\\BlogPost'); // 'blog_posts'
$inflector->tableToClass('blog_posts');            // 'BlogPost'

// English Pluralization & Singularization (covers 114 irregular special rules)
$inflector->toPlural('ox');        // 'oxen'
$inflector->toPlural('child');     // 'children'
$inflector->toPlural('criterion'); // 'criteria'
$inflector->toSingular('people');  // 'person'

// Slug generation with automated transliteration
$inflector->toSlug('Hélène & François'); // 'helene-and-francois'
```

> [!NOTE]
> **Phantom Method Warning:** `Inflector::idToPascalCase()` does **not** exist. Use `$inflector->toPascalCase($id)` — it handles dashes, underscores, and spaces.

#### Transliteration Strategies
`Inflector` uses PHP's `ext-intl` (`Transliterator`) by default.
- `Inflector::TRANSLITERATE_LOOSE` (default): Converts to ASCII and strips remaining non-ASCII characters (`Any-Latin; Latin-ASCII; [\u0080-\uffff] remove`).
- `Inflector::TRANSLITERATE_MEDIUM`: Converts to Latin-1 (`Any-Latin; Latin-ASCII`).
- `Inflector::TRANSLITERATE_STRICT`: Preserves non-ASCII diacritics (`Any-Latin; NFKD`).
- `->withoutIntl()`: Forces usage of the built-in 64-character Latin-1 fallback map (useful to guarantee identical slug generation across environments lacking `ext-intl`).

### 3.3. NumericHelper: Ordinals, Sizing, Normalization

```php
declare(strict_types=1);

use Yiisoft\Strings\NumericHelper;

// English Ordinals
NumericHelper::toOrdinal(1);  // '1st'
NumericHelper::toOrdinal(22); // '22nd'
NumericHelper::toOrdinal(33); // '33rd'
NumericHelper::toOrdinal(104); // '104th'

// Normalization (removes spaces, normalizes commas, keeps ONLY the last dot)
NumericHelper::normalize('1 250,50');      // '1250.50'
NumericHelper::normalize('4.294.967,295'); // '4294967.295'

// Integer Validation
NumericHelper::isInteger('42');   // true
NumericHelper::isInteger('42.5'); // false

// Trailing Decimal Zero Stripping
NumericHelper::trimDecimalZeros('12.5000'); // '12.5'
NumericHelper::trimDecimalZeros('100.00');  // '100'
NumericHelper::trimDecimalZeros(null);      // null (null-safe)

// Human-Readable Size to Bytes (supports Binary 1024 and Decimal 1000 units)
NumericHelper::convertHumanReadableSizeToBytes('2KiB'); // 2048 bytes (3-char = Binary 1024^N)
NumericHelper::convertHumanReadableSizeToBytes('2kB');  // 2000 bytes (2-char = Decimal 1000^N)
NumericHelper::convertHumanReadableSizeToBytes('2K');   // 2048 bytes (1-char = Binary 1024^N)
NumericHelper::convertHumanReadableSizeToBytes('5MB');  // 5000000 bytes
NumericHelper::convertHumanReadableSizeToBytes('5MiB'); // 5242880 bytes
```

### 3.4. CombinedRegexp & WildcardPattern

Based on Nikita Popov's PCRE branch reset optimization (`(?|...)`), `CombinedRegexp` compiles multiple regular expressions into a single compiled pattern, executing routing or pattern matching in a single `preg_match` pass.

```php
declare(strict_types=1);

use Yiisoft\Strings\CombinedRegexp;
use Yiisoft\Strings\MemoizedCombinedRegexp;
use Yiisoft\Strings\WildcardPattern;

$patterns = [
    '#^/api/v1/users/(?P<id>\d+)$#',
    '#^/api/v1/orders/(?P<id>\d+)$#',
    '#^/healthz$#',
];

$combined = new CombinedRegexp($patterns);

if ($combined->matches('/api/v1/users/42')) {
    // Determines exactly WHICH pattern matched without testing sequentially
    $matchedPattern = $combined->getMatchingPattern('/api/v1/users/42');
    // Returns '#^/api/v1/users/(?P<id>\d+)$#'
}

// Decorator: Memoizes pattern evaluations across the request lifecycle
$memoized = new MemoizedCombinedRegexp($combined);

// Shell Glob Matching with WildcardPattern
$pattern = (new WildcardPattern('src/**/*.php', delimiters: ['/', '\\']))->ignoreCase();
$pattern->match('src/Domain/Model/User.PHP'); // true

WildcardPattern::isDynamic('templates/*.html'); // true (contains wildcard markers)
WildcardPattern::quote('user.*.profile');       // 'user\.\*\.profile' (escapes wildcards)
```

---

## 4. `yiisoft/json` — Safe JSON Handling

`Yiisoft\Json\Json` is a `final` class with static methods wrapping native PHP JSON functions.

### 4.1. Invariant: Exception-Safe Encoding & Decoding

Native `json_encode()` and `json_decode()` return `false` or `null` on errors, requiring awkward `json_last_error()` checks. `Yiisoft\Json\Json` unconditionally enforces `JSON_THROW_ON_ERROR`.

```php
declare(strict_types=1);

use JsonException;
use Yiisoft\Json\Json;

try {
    $encoded = Json::encode(['name' => 'Alexander', 'active' => true]);
    $decoded = Json::decode($encoded); // Returns associative array by default ($asArray = true)
    $asObject = Json::decode($encoded, asArray: false); // Returns stdClass
} catch (JsonException $e) {
    // Encoding or syntax errors always throw JsonException
}

// Special Case: Empty string safely returns null without throwing
$result = Json::decode(''); // null
```

### 4.2. XSS Prevention with htmlEncode()

When injecting JSON payloads into HTML views (such as `<script>` tags or HTML data attributes), `Json::encode()` is insecure because raw forward slashes (`/`) allow attackers to close enclosing tags via `</script>`.

`Json::htmlEncode()` applies `JSON_UNESCAPED_UNICODE | JSON_HEX_QUOT | JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS` and **deliberately excludes `JSON_UNESCAPED_SLASHES`**:

```php
declare(strict_types=1);

use Yiisoft\Json\Json;

$payload = ['message' => '</script><script>alert("XSS")</script>'];

// INSECURE inside HTML templates:
// Outputs: {"message":"</script><script>alert(\"XSS\")</script>"}
$bad = Json::encode($payload);

// SECURE: Escapes forward slash as \/ and characters as \uXXXX entities:
// Outputs: {"message":"\u003C\/script\u003E\u003Cscript\u003Ealert(\u0022XSS\u0022)\u003C\/script\u003E"}
$safe = Json::htmlEncode($payload);
```

### 4.3. Type Preprocessing: Enums, Dates, Traversables & Objects

`Json::encode()` recursively inspects complex objects before serialization:
- **`BackedEnum` (PHP 8.1+):** Automatically serializes to its backing `string` or `int` scalar.
- **Pure `UnitEnum`:** Throws `\JsonException: Non-backed enums have no default serialization`.
- **`DateTimeInterface`:** Preserves timezone and formatting (`{"date":"2026-10-30 17:00:00.000000","timezone_type":3,"timezone":"UTC"}`).
- **`JsonSerializable`:** Invokes `$object->jsonSerialize()` and recursively processes results.
- **`SimpleXMLElement`:** Normalized into arrays (empty XML nodes serialize as `{}` instead of `[]`).
- **`Traversable` & Plain Objects:** Converted via `iterator_to_array()` or `get_object_vars()` (strictly public properties; private/protected properties never leak).

---

## 5. `yiisoft/var-dumper` — VarDumper & ClosureExporter

`yiisoft/var-dumper` serves two distinct purposes:
1. **Interactive Development Debugging:** Syntax-highlighted output, socket streaming (`StreamHandler`).
2. **Production Code Generation:** Evaluatable PHP export (`export()`), short array syntax `[...]`, and token-parsed closure extraction (`ClosureExporter`).

### 5.1. Debug Output & Global Helpers (d, dump, dd)

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

### 5.2. Handlers: Echo, Stream & Composite

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

### 5.3. Code Export and Closure Serialization

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
> **Authentication & RBAC Guide Reference:**
> For the full RBAC storage architecture — `yiisoft/rbac-php` file storages, concurrent-write decorators, and the `items.php` schema — see the [Authentication & RBAC Guide, §8.5](infra-auth-and-rbac.md#85-php-file-storage-yiisoftrbac-php).

---

## 6. `yiisoft/classifier` — Class Discovery

`Yiisoft\Classifier\Classifier` scans directories and discovers user-defined classes matching given interfaces, parent classes, or PHP 8 attributes.

### 6.1. Criteria Configuration & Scanning

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

### 6.2. Execution Lifecycle & Performance Boundaries

1. **AND Combination:** All configured filters (`withInterface`, `withParentClass`, `withAttribute`) are combined with **AND** logic. A class must satisfy every condition.
2. **Empty Filter Guard:** Calling `find()` without configuring any criteria returns an empty array `[]` immediately.
3. **Filter Scope:** Returns only user-defined classes (`$reflection->isUserDefined()`) located in the specified directories.

> [!WARNING]
> **Implementation Heavy Side-Effect:** To inspect classes via reflection, `Classifier::find()` runs `Symfony\Component\Finder\Finder` and calls `require_once` on **every single `*.php` file** found in the target directories.
>
> **Architectural Invariant:** Never invoke `Classifier::find()` inside per-request web controllers or middleware! Invoke `Classifier` exclusively within **CLI console commands, build-time compilation scripts, or deployment cache-warming routines**. Cache the discovered class-string list into a PHP or JSON cache file.

---

## 7. `yiisoft/network-utilities` — IpHelper, DnsHelper, IpRanges

`yiisoft/network-utilities` is a zero-dependency package providing IP validation, CIDR subnet matching, DNS verification, and allowlist/denylist firewall evaluations.

### 7.1. IpHelper: Validation & CIDR Math

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

### 7.2. DnsHelper: MX, A Records & RFC 5321 Fallback

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

### 7.3. IpRanges: Rule Matching, Aliases & Security Invariant

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

## 8. `yiisoft/requirements` — Deployment & Environment Verification

`yiisoft/requirements` (`Yiisoft\Requirements\RequirementsChecker`) is a framework-independent pre-flight diagnostic utility designed for Docker container startup, CI/CD validation pipelines, and application deployment scripts. Install it as a dev dependency (`composer require --dev`) when it is only used in development/CI tooling; require it as a regular dependency if production startup or deployment checks invoke it (e.g., Docker container entrypoints).

### 8.1. RequirementsChecker Architecture & Rule Schema

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

### 8.2. CLI Pre-Flight Check & CI/CD Docker Integration

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

## 9. `yiisoft/friendly-exception` — Actionable Error Solution Contract

`yiisoft/friendly-exception` (`Yiisoft\FriendlyException\FriendlyExceptionInterface`) is a lightweight contract that extends `\Throwable`. It establishes a standard mechanism for exceptions to provide actionable remediation steps directly to developers.

### 9.1. Interface Contract & Markdown Invariant

```php
declare(strict_types=1);

namespace Yiisoft\FriendlyException;

use Throwable;

interface FriendlyExceptionInterface extends Throwable
{
    /**
     * Human-understandable exception title.
     */
    public function getName(): string;

    /**
     * Actionable remediation instructions to resolve the error.
     * Must be formatted as plain CommonMark Markdown. HTML tags are forbidden!
     */
    public function getSolution(): ?string;
}
```

> [!IMPORTANT]
> **Three Invariants for `getSolution()`:**
> 1. Keep instructions concise, focused, and directly actionable.
> 2. **Never use raw HTML tags.**
> 3. **Use standard CommonMark Markdown** (backticks for CLI commands, file paths, and configuration keys).

### 9.2. Implementation Recipe & Ecosystem Handlers

Over 25 packages in the Yii3 ecosystem implement this interface (including `yiisoft/di`, `yiisoft/error-handler`, `yiisoft/yii-console`, `yiisoft/middleware-dispatcher`, and `yiisoft/validator`).

#### Canonical Application Exception Recipe
```php
declare(strict_types=1);

namespace App\Exception;

use RuntimeException;
use Yiisoft\FriendlyException\FriendlyExceptionInterface;

final class DatabaseConfigurationException extends RuntimeException implements FriendlyExceptionInterface
{
    public function __construct(
        private string $connectionName,
        string $message = 'Database connection failed.'
    ) {
        parent::__construct($message);
    }

    public function getName(): string
    {
        return 'Database Connection Configuration Error';
    }

    public function getSolution(): ?string
    {
        return <<<MARKDOWN
        The database connection `{$this->connectionName}` could not be established.

        **To fix this issue:**
        1. Check your `.env` file to verify that `DB_HOST`, `DB_PORT`, and `DB_NAME` are correctly defined.
        2. Ensure your local database daemon (e.g. PostgreSQL or MySQL) is running.
        3. Run database migrations:
           ```bash
           ./yii migrate:up
           ```
        MARKDOWN;
    }
}
```

#### Automatic Ecosystem Rendering
Application code never needs custom try-catch rendering blocks for friendly exceptions:
- **Web Requests (`yiisoft/error-handler`):** In debug mode, `HtmlRenderer` renders `$e->getName()` in the title banner and parses `$e->getSolution()` via Markdown into a styled, prominent solution container above the stack trace.
- **Console Commands (`yiisoft/yii-console`):** `Application::doRenderThrowable()` intercepts friendly exceptions, outputting a styled `<fg=red>` header with the friendly name and a prominent `<fg=yellow>` note block with the solution text.

---

## 10. Placement in Yii3 Architecture

Following the architectural taxonomy in [Architecture Alignment Guide](core-architecture-alignment.md):

| Layer | Packages | Clean Architecture Placement & Invariants |
|---|---|---|
| **Cross-Cutting Contracts** | `friendly-exception` | Domain, Application, and Infrastructure layers. Interfaces and custom domain exceptions can implement `FriendlyExceptionInterface` without coupling to framework runtimes. |
| **Infrastructure / Utilities** | `arrays`, `strings`, `json`, `network-utilities` | `Infrastructure/Utils/` or shared helper libraries. Pure static functions and value objects. Directly callable from DTO mappers, repositories, and infrastructure adapters. |
| **Infrastructure / Discovery** | `classifier` | `Infrastructure/Discovery/`. Console commands and build tasks only. Discovered class-strings must be cached before runtime serving. |
| **Dev Tooling & Build Diagnostics** | `requirements`, `var-dumper` | `require-dev` (or runtime `require` if persisting closures/rules in storage files). Used in Docker healthchecks, CI/CD pipelines, and local debugging. |

```
Application Architecture Boundary:
┌────────────────────────────────────────────────────────┐
│ Domain / Application Layers                            │
│  - Implements FriendlyExceptionInterface               │
│  - Calls domain adapters (e.g. SluggerInterface)       │
└──────────────────────────┬─────────────────────────────┘
                           │ Wraps & delegates
┌──────────────────────────▼─────────────────────────────┐
│ Infrastructure / Utilities                             │
│  - ArrayHelper, StringHelper, Json, IpHelper           │
│  - Pure, stateless, zero DI configuration              │
└────────────────────────────────────────────────────────┘
```

If your domain layer requires string transformations (such as slug generation), define a domain contract (`App\Domain\Service\SluggerInterface`) and implement an infrastructure adapter wrapping `Yiisoft\Strings\Inflector`. This prevents static utility classes from leaking into pure domain models.

---

## 11. Anti-Pattern Matrix

| # | Forbidden Anti-Pattern | Why It Breaks / Production Consequences | Idiomatic Yii3 Solution |
|---|---|---|---|
| 1 | **`ArrayHelper::getValue($data, 'user.name')` for dot paths** | `getValue()` does NOT parse string dot-paths; it searches for literal key `$data['user.name']` and returns `null`. | Use `ArrayHelper::getValueByPath($data, 'user.name')` or key array `ArrayHelper::getValue($data, ['user', 'name'])`. |
| 2 | **Assuming `$default` is returned for missing object properties in `getValue()`** | If a property does not exist on a plain object, PHP 8.2+ emits `Warning: Undefined property` and returns `null`. `$default` is ignored. | Verify property existence with `property_exists()`, implement `__get()`, or convert object to array via `ArrayHelper::toArray()`. |
| 3 | **Passing single exclusion rule `['!password']` to `ArrayHelper::filter()`** | `filter()` applies whitelisting first; with no positive rules, the whitelist is empty and returns `[]`. | Pass positive whitelist rules first (`['user', '!user.password']`) or use `ArrayHelper::remove()` / `removeByPath()`. |
| 4 | **Treating `ArrayHelper::setValue()` result as the new array** | `setValue()`, `setValueByPath()`, `addValue()`, and `addValueByPath()` mutate **by reference** and return `void`. | Pass the array variable directly (`ArrayHelper::setValue($data, 'key', $val);`); do not assign the return value. |
| 5 | **Unescaped dots in literal keys passed to path helpers** | `ArrayHelper::getValueByPath($data, 'db.name')` splits into `['db', 'name']`, failing to match literal key `'db.name'`. | Escape literal dots with a backslash: `ArrayHelper::getValueByPath($data, 'db\.name')`. |
| 6 | **Assuming `ArrayHelper::htmlEncode()` encodes keys by default** | Parameter `$valuesOnly` defaults to `true`. Array keys remain unencoded and vulnerable to XSS. | Explicitly pass `valuesOnly: false`: `ArrayHelper::htmlEncode($data, valuesOnly: false)`. |
| 7 | **Expecting `ArraySorter::multisort()` to return sorted array** | `multisort()` takes the array by reference (`&$array`) and returns `void`. Assigning its result yields `null`. | Pass the array variable directly: `ArraySorter::multisort($records, ['priority', 'name']);`. |
| 8 | **Calling static methods on `Yiisoft\Strings\Inflector`** | `Inflector` has NO static methods in Yii3; all methods are instance-based and immutable. `idToPascalCase()` also does not exist. | Instantiate `Inflector`: `$inflector = new Inflector()`; use `$inflector->toPascalCase($id)`. |
| 9 | **Passing `$asHtml` argument to `StringHelper::truncate*()`** | Yii 2 featured an `$asHtml` flag, but Yii3 truncation methods do not have it. Calling it triggers `ArgumentCountError`. | Perform plain truncation with `StringHelper::truncateEnd()` and sanitize HTML tags separately. |
| 10 | **Using `utf8_encode()` or `strtolower()` on UTF-8 user text** | Corrupts multibyte Unicode characters. `utf8_encode()` is deprecated in PHP 8.2 and removed in PHP 9.0. | Use `StringHelper::lowercase()`, `StringHelper::uppercase()`, or `StringHelper::substring()`. |
| 11 | **Raw `json_encode()` / `json_decode()` without `JSON_THROW_ON_ERROR`** | Returns `false` or `null` silently on syntax failures, propagating corrupted data down the pipeline. | Use `Json::encode()` and `Json::decode()`, which guarantee `\JsonException` on any encoding or decoding error. |
| 12 | **Embedding `Json::encode()` output into HTML `<script>` tags** | Unescaped forward slashes allow attackers to inject `</script>` tags, causing Cross-Site Scripting (XSS). | Always use `Json::htmlEncode()`, which deliberately encodes `/` as `\/` and quotes characters as entities. |
| 13 | **Calling `VarDumper::create()->asString(10, true)` with two arguments** | `asString(int $depth = 10)` accepts only one argument (unlike static `dump()`). Passing two arguments triggers `ArgumentCountError`. | Call `VarDumper::create($data)->asString(depth: 10)` with the single depth argument. |
| 14 | **Assuming `dump()` terminates script execution** | In Yii3, `dump()` is an alias of `d()`. It outputs the dump and continues execution; it does not halt. | Use `dd(...$vars)` if script termination via `die(0)` is required. |
| 15 | **Passing `null` to `VarDumper::setDefaultHandler(?HandlerInterface $handler)`** | Parameter `$handler` is strictly typed `HandlerInterface` (non-nullable). Passing `null` causes a fatal `TypeError`. | Provide a valid handler instance, such as `new EchoHandler()` or `new StreamHandler()`. |
| 16 | **Running `Classifier::find()` in per-request web controller actions** | `Classifier` traverses files and executes `require_once` on every PHP file, causing massive per-request I/O latency. | Execute `Classifier` only in console commands or deployment build steps; cache discovered class lists. |
| 17 | **Assuming `IpRanges` with an empty rules array denies access** | When `$ranges` is empty, `isAllowed()` defaults to `true`, granting access to every IP address on the Internet! | Guard against empty range arrays, and always append a trailing catch-all deny rule: `'!' . IpRanges::ANY`. |

---

## 12. Related Topic Guides

- [Architecture Alignment Guide](core-architecture-alignment.md) — Architectural placement of utility packages, static helper boundaries, and domain adapter encapsulation.
- [File Handling Guide](http-file-handling.md) — Filesystem operations via `yiisoft/files` (`FileHelper`), stream responses, and secure file uploads.
- [DI & Configuration Guide](core-di-and-config.md) — Path aliases via `yiisoft/aliases` (`Aliases`) and configuration parameter compilation.
- [Authentication & RBAC Guide](infra-auth-and-rbac.md) — Role-based access control storage using `VarDumper::create()->export()` to persist PHP permission rules.
- [Views & Widgets Guide](http-views-and-widgets.md) — Secure template rendering, HTML escaping, and embedding `Json::htmlEncode()` payloads into JavaScript widgets.
- [PSR-15 Middlewares Guide](http-middlewares.md) — Enforcing network security guards, trusted proxy subnets, and IP allowlists via `IpRanges`.
- [Console Commands Guide](infra-commands.md) — Authoring console commands that execute build-time `Classifier` scanning and `RequirementsChecker` pre-flight diagnostics.
- [Caching Guide](persistence-caching.md) — Caching discovered class lists, reflection metadata, and compiled regular expression match tables.
