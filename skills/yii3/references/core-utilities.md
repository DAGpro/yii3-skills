# Yii3 Utility Packages Guide

> [!IMPORTANT]
> **Grounding rule:** this guide carries the implementation instructions for its topic — follow it when implementing project code; project code itself is integration context, never a source of truth. The source of truth for every class name, method signature, constructor argument, and configuration key is the installed package source under `vendor/yiisoft/<pkg>/src/` (versions via `composer.lock`). Verify there before writing code; never assume Yii 2 APIs.

> Comprehensive guide to the core Yii3 standalone utility packages used in almost every application: array manipulation (`yiisoft/arrays`), string, inflector and regex helpers (`yiisoft/strings`), and exception-safe JSON (`yiisoft/json`). These packages are pure, framework-independent libraries — zero DI container wiring, no configuration plugins, and no static facades. The niche, rarely-needed standalone helpers (`yiisoft/var-dumper`, `yiisoft/classifier`, `yiisoft/network-utilities`, `yiisoft/requirements`) are owned by the [Niche Utility Packages Guide](core-utilities-niche.md), and the Friendly Exception contract (`yiisoft/friendly-exception`) by the [Friendly Exceptions Guide](core-friendly-exceptions.md) — load those child guides on demand.

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
- [5. `yiisoft/var-dumper` — VarDumper & ClosureExporter](#5-yiisoftvar-dumper--vardumper--closureexporter) — full reference in the [Niche Utility Packages Guide, §1](core-utilities-niche.md#1-yiisoftvar-dumper--vardumper--closureexporter)
- [6. `yiisoft/classifier` — Class Discovery](#6-yiisoftclassifier--class-discovery) — full reference in the [Niche Utility Packages Guide, §2](core-utilities-niche.md#2-yiisoftclassifier--class-discovery)
- [7. `yiisoft/network-utilities` — IpHelper, DnsHelper, IpRanges](#7-yiisoftnetwork-utilities--iphelper-dnshelper-ipranges) — full reference in the [Niche Utility Packages Guide, §3](core-utilities-niche.md#3-yiisoftnetwork-utilities--iphelper-dnshelper-ipranges)
- [8. `yiisoft/requirements` — Deployment & Environment Verification](#8-yiisoftrequirements--deployment--environment-verification) — full reference in the [Niche Utility Packages Guide, §4](core-utilities-niche.md#4-yiisoftrequirements--deployment--environment-verification)
- [9. `yiisoft/friendly-exception` — Actionable Error Solution Contract](#9-yiisoftfriendly-exception--actionable-error-solution-contract) — full reference in the [Friendly Exceptions Guide](core-friendly-exceptions.md)
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
| `yiisoft/var-dumper` | `composer require yiisoft/var-dumper` | `VarDumper`, `ClosureExporter` | Debugging dumps and evaluatable code export — owned by the [Niche Utility Packages Guide, §1](core-utilities-niche.md#1-yiisoftvar-dumper--vardumper--closureexporter). |
| `yiisoft/classifier` | `composer require yiisoft/classifier` | `Classifier` | Directory class discovery by interface, parent, or attribute (console/build steps only) — owned by the [Niche Utility Packages Guide, §2](core-utilities-niche.md#2-yiisoftclassifier--class-discovery). |
| `yiisoft/network-utilities` | `composer require yiisoft/network-utilities` | `IpHelper`, `DnsHelper`, `IpRanges` | Zero-dependency IP/CIDR math, DNS verification, and firewall rules — owned by the [Niche Utility Packages Guide, §3](core-utilities-niche.md#3-yiisoftnetwork-utilities--iphelper-dnshelper-ipranges). |
| `yiisoft/requirements` | `composer require [--dev] yiisoft/requirements` — typically `--dev`; require as a regular dependency if used in production startup/deployment checks | `RequirementsChecker` | Pre-flight system capability verification — owned by the [Niche Utility Packages Guide, §4](core-utilities-niche.md#4-yiisoftrequirements--deployment--environment-verification). |
| `yiisoft/friendly-exception` | `composer require yiisoft/friendly-exception` | `FriendlyExceptionInterface` | Cross-cutting contract defining `getName()` and `getSolution()` — owned by the [Friendly Exceptions Guide](core-friendly-exceptions.md). |

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

> **For the complete reference on** `yiisoft/var-dumper` — debug output helpers (`d()`, `dump()`, `dd()`), Echo/Stream/Composite handlers, `export()` short-array syntax and closure serialization, and the `yiisoft/rbac-php` runtime persistence example — **see the** [Niche Utility Packages Guide, §1](core-utilities-niche.md#1-yiisoftvar-dumper--vardumper--closureexporter).

---

## 6. `yiisoft/classifier` — Class Discovery

> **For the complete reference on** `yiisoft/classifier` — criteria configuration (`withInterface`, `withParentClass`, `withAttribute`), the AND-combination execution lifecycle, and the CLI-only architectural invariant (`require_once` side effects) — **see the** [Niche Utility Packages Guide, §2](core-utilities-niche.md#2-yiisoftclassifier--class-discovery).

---

## 7. `yiisoft/network-utilities` — IpHelper, DnsHelper, IpRanges

> **For the complete reference on** `yiisoft/network-utilities` — IP validation and CIDR math, `DnsHelper` MX/A records with the RFC 5321 email fallback, `IpRanges` allow/deny rules with RFC 5735 aliases, and the empty-`$ranges`-grants-all security gotcha — **see the** [Niche Utility Packages Guide, §3](core-utilities-niche.md#3-yiisoftnetwork-utilities--iphelper-dnshelper-ipranges).

---

## 8. `yiisoft/requirements` — Deployment & Environment Verification

> **For the complete reference on** `yiisoft/requirements` — the rule schema (`condition`, `name`, `mandatory`, `by`, `memo`), built-in `'eval:'` environment evaluators, and the CLI pre-flight check with CI/CD Docker integration — **see the** [Niche Utility Packages Guide, §4](core-utilities-niche.md#4-yiisoftrequirements--deployment--environment-verification).

---

## 9. `yiisoft/friendly-exception` — Actionable Error Solution Contract

> **For the complete reference on** Friendly Exceptions — the `FriendlyExceptionInterface` contract and Markdown solution invariants, implementation recipes, and the automatic web (`yiisoft/error-handler`) and console (`yiisoft/yii-console`) rendering — **see the** [Friendly Exceptions Guide](core-friendly-exceptions.md).

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

Anti-pattern rows for the niche packages (`yiisoft/var-dumper`, `yiisoft/classifier`, `yiisoft/network-utilities`) live in the [Niche Utility Packages Guide, §5](core-utilities-niche.md#5-anti-patterns--common-traps).

---

## 12. Related Topic Guides

- [Niche Utility Packages Guide](core-utilities-niche.md) — Rarely-needed standalone helpers: `yiisoft/var-dumper` (debugging and closure export), `yiisoft/classifier` (class discovery), `yiisoft/network-utilities` (IP/CIDR/DNS/firewall), and `yiisoft/requirements` (deployment pre-flight checks).
- [Friendly Exceptions Guide](core-friendly-exceptions.md) — Actionable error solution contract (`FriendlyExceptionInterface`) with automatic web and console rendering.
- [Architecture Alignment Guide](core-architecture-alignment.md) — Architectural placement of utility packages, static helper boundaries, and domain adapter encapsulation.
- [File Handling Guide](http-file-handling.md) — Filesystem operations via `yiisoft/files` (`FileHelper`), stream responses, and secure file uploads.
- [DI & Configuration Guide](core-di-and-config.md) — Path aliases via `yiisoft/aliases` (`Aliases`) and configuration parameter compilation.
- [Authentication & RBAC Guide](infra-auth-and-rbac.md) — Role-based access control; PHP file storage of permission rules is owned by the [RBAC Storage Drivers Guide](infra-rbac-storage.md).
- [Views & Widgets Guide](http-views-and-widgets.md) — Secure template rendering, HTML escaping, and embedding `Json::htmlEncode()` payloads into JavaScript widgets.
- [PSR-15 Middlewares Guide](http-middlewares.md) — Enforcing network security guards, trusted proxy subnets, and IP allowlist rules.
- [Console Commands Guide](infra-commands.md) — Authoring console commands, including build-time class discovery and requirements pre-flight diagnostics.
- [Caching Guide](persistence-caching.md) — Caching discovered class lists, reflection metadata, and compiled regular expression match tables.
