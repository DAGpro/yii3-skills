# Yii3 Internationalization & Translation Guide

> Practical guide for message translation with `yiisoft/translator`, locale handling with `yiisoft/i18n`,
> storage backends (`translator-message-php/db/gettext`), message extraction with `translator-extractor`,
> locale routing with `Yiisoft\Yii\Middleware\Locale`, plus the supporting packages the DB backend needs
> (`yiisoft/db`, `yiisoft/cache`, `yiisoft/db-migration`) and the i18n boundaries of view/mailer/error-handler.

---

## Table of Contents
- [1. Package Map & Installation](#1-package-map--installation)
- [2. Core Translation API (`yiisoft/translator`)](#2-core-translation-api-yiisofttranslator)
  - [2.1. TranslatorInterface](#21-translatorinterface)
  - [2.2. DI Wiring](#22-di-wiring)
  - [2.3. Category Sources](#23-category-sources)
  - [2.4. Quick Start (End-to-End Slice)](#24-quick-start-end-to-end-slice)
- [3. Formatters](#3-formatters)
- [4. Message Storage Backends](#4-message-storage-backends)
  - [4.1. PHP Files (translator-message-php)](#41-php-files-translator-message-php)
  - [4.2. Database (translator-message-db)](#42-database-translator-message-db)
  - [4.3. Gettext (translator-message-gettext)](#43-gettext-translator-message-gettext)
- [5. Message Extraction (translator-extractor)](#5-message-extraction-translator-extractor)
- [6. Locale Handling](#6-locale-handling)
  - [6.1. Locale Value Object (yiisoft/i18n)](#61-locale-value-object-yiisofti18n)
  - [6.2. Locale Middleware (yii-middleware)](#62-locale-middleware-yii-middleware)
- [7. Missing Translation Events](#7-missing-translation-events)
- [8. Ecosystem Integration Boundaries](#8-ecosystem-integration-boundaries)
- [9. Testing the Translator](#9-testing-the-translator)
- [10. Anti-Pattern Matrix](#10-anti-pattern-matrix)

---

## 1. Package Map & Installation

| Package | Role |
|---|---|
| `yiisoft/translator` | Translation engine: `TranslatorInterface`, `CategorySource`, formatters, missing-translation events, `IdMessageReader`, `InMemoryMessageSource`. Requires `yiisoft/i18n ^1.0`, `psr/event-dispatcher`, `yiisoft/files` (source: `vendor/yiisoft/translator/composer.json` `require` block). |
| `yiisoft/i18n` | **Only two classes**: the BCP 47 `Locale` value object and the stateful `LocaleProvider`. No formatters, no category logic — everything else lives in `yiisoft/translator`. |
| `yiisoft/translator-message-php` | Reader + writer over PHP array files (`{path}/{locale}/{category}.php`) |
| `yiisoft/translator-message-db` | Reader + writer over a database (`yii_source_message` + `yii_message` tables, optional cache). Requires `yiisoft/db` and `yiisoft/cache` (pulled in automatically). |
| `yiisoft/translator-message-gettext` | Read-only reader over compiled gettext catalogs (`.mo`), requires `ext-gettext` |
| `yiisoft/translator-extractor` | Console command `translator/extract` that scans source code for `->translate` calls |
| `yiisoft/yii-middleware` | `Yiisoft\Yii\Middleware\Locale` — locale-based routing middleware (same package also ships CORS and others) |

Supporting packages (required or useful depending on the chosen backend):

| Package | Why it is relevant here |
|---|---|
| `yiisoft/db` + one driver (`yiisoft/db-mysql`, `yiisoft/db-pgsql`, `yiisoft/db-sqlite`, `yiisoft/db-mssql`, `yiisoft/db-oracle`) | Provides `Yiisoft\Db\Connection\ConnectionInterface` — the first constructor argument of the DB message source (§4.2) |
| `yiisoft/cache` | Provides `Yiisoft\Cache\CacheInterface` (a wrapper over PSR-16) — the optional second constructor argument of the DB message source (§4.2) |
| `yiisoft/db-migration` | Idiomatic way to create the `yii_source_message` / `yii_message` schema (§4.2) |
| `yiisoft/router` (+ `yiisoft/router-fastroute`) | `UrlGeneratorInterface` is a constructor dependency of the `Locale` middleware; `_language` URL prefixing works through it (§6.2) |
| `yiisoft/files` | Indirect core dependency — the extractor uses its wildcard patterns for `--only` / `--except` (§5) |

Installation sets:

```sh
# Core + PHP-file storage:
composer require yiisoft/translator yiisoft/translator-message-php

# DB storage (yiisoft/db, yiisoft/cache and a driver of your choice):
composer require yiisoft/translator yiisoft/translator-message-db yiisoft/db yiisoft/db-mysql

# Message extraction (dev-time tool):
composer require --dev yiisoft/translator-extractor
```

Formatters are **built into** `yiisoft/translator` — there are no separate formatter packages to install.
The core `Translator` also ships the in-code extractor classes (`Yiisoft\Translator\Extractor\*`), which need
`ext-tokenizer` (a `suggest` of `yiisoft/translator`).

## 2. Core Translation API (`yiisoft/translator`)

### 2.1. TranslatorInterface

Complete interface (from `vendor/yiisoft/translator/src/TranslatorInterface.php:19-65`):

```php
public function addCategorySources(CategorySource ...$categories): static;
public function setLocale(string $locale): static;
public function getLocale(): string;
public function translate(
    string|Stringable $id,
    array $parameters = [],
    ?string $category = null,   // null → default category ('app' by default)
    ?string $locale = null,     // null → current locale
): string;
public function withDefaultCategory(string $category): static; // NEW instance; RuntimeException if source not registered
public function withLocale(string $locale): static;            // NEW instance
```

Inject `Yiisoft\Translator\TranslatorInterface` into services. There is no `getCategory()` method on the
interface or on `Translator` — only the event objects carry a category (§7).

Translation resolution order in `translate()` (from `vendor/yiisoft/translator/src/Translator.php:72-145`):

1. `$locale ??= $this->locale`, `$category ??= $this->defaultCategory`.
2. If no source is registered for the category: `MissingTranslationCategoryEvent` is dispatched (at most once
   per category per translator instance), and the **raw id** is returned formatted by the translator's default
   formatter with locale `fallbackLocale ?? $locale` (`Translator.php:82-85`).
3. Otherwise the category sources are tried **last to first** (a later-registered source with the same category
   name overrides an earlier one; `MissingTranslationEvent` fires per source per locale attempt).
4. Own-locale fallback: `Yiisoft\I18n\Locale::fallbackLocale()` is applied and the search recurses while the
   string keeps changing (strips exactly one structural subtag per step — variant → region → script, §6.1).
5. The configured `fallbackLocale` is tried the same way.
6. Finally the raw id is formatted by the **last** source's formatter with the original locale.

Formatter precedence: a `CategorySource`'s own formatter wins over the translator's default — the source calls
`$this->formatter ?? $defaultFormatter` (`vendor/yiisoft/translator/src/CategorySource.php:135`).

### 2.2. DI Wiring

The package ships `config/di.php` + `config/params.php`. Defaults (`vendor/yiisoft/translator/config/params.php:5-11`,
verbatim):

```php
return [
    'yiisoft/translator' => [
        'locale' => 'en-US',
        'fallbackLocale' => null,
        'defaultCategory' => 'app',
    ],
];
```

`Translator` constructor (from `vendor/yiisoft/translator/src/Translator.php:38-46`):

```php
public function __construct(
    private string $locale = 'en-US',
    private ?string $fallbackLocale = null,
    private string $defaultCategory = 'app',
    private ?EventDispatcherInterface $eventDispatcher = null,
    ?MessageFormatterInterface $defaultMessageFormatter = null, // defaults to NullMessageFormatter
)
```

> [!WARNING]
> Two shipped examples are **stale — do not copy them positionally**:
> 1. The `README.md` "Quick start" of `yiisoft/translator` passes `($locale, $fallbackLocale, $eventDispatcher)`
>    — the 3rd positional parameter is now `$defaultCategory` (a string), so an event dispatcher lands in the
>    wrong slot and a `TypeError` follows.
> 2. The commented example inside `vendor/yiisoft/translator/config/di.php` constructs
>    `CategorySource($name, $messageSource, $messageSource, $messageFormatter)` — the real constructor order is
>    `(name, reader, formatter, writer)` (§2.3), so reader and formatter slots are swapped there.
>
> Always use named arguments in your own wiring, and treat `vendor/yiisoft/<pkg>/src/` as ground truth.

The default formatter is `NullMessageFormatter` — messages are returned **unformatted** (no `{placeholder}`
substitution) unless an alias is configured (§3). Setting `'fallbackLocale' => 'en-US'` is the usual production
choice so untranslated strings fall back to English instead of showing raw ids.

The shipped `config/di.php` consumes the `translation.categorySource` tag:

```php
TranslatorInterface::class => [
    'class' => Translator::class,
    '__construct()' => [
        $params['yiisoft/translator']['locale'],
        $params['yiisoft/translator']['fallbackLocale'],
        $params['yiisoft/translator']['defaultCategory'],
        Reference::optional(EventDispatcherInterface::class), // events are optional (§7)
    ],
    'addCategorySources()' => ['categories' => Reference::to('tag@translation.categorySource')],
    'reset' => function () use ($params) {
        /** @var Translator $this */
        $this->setLocale($params['yiisoft/translator']['locale']);
    },
],
```

Note the `reset` closure: in long-running workers it restores the default locale per request, so a locale set
for one request does not leak into the next.

Category sources are attached by the **application** — the package only consumes the tag. The tagged-definition
shape below mirrors the package's own `config/di.php` example (with the constructor argument order corrected)
and is application-level configuration, e.g. `config/common/di/translation.php` in app templates:

```php
// config/common/di/translation.php
declare(strict_types=1);

use Yiisoft\Translator\CategorySource;
use Yiisoft\Translator\Message\Php\MessageSource;
use Yiisoft\Translator\SimpleMessageFormatter;

/** @var array $params */

return [
    'translation.app' => [
        'definition' => static function () use ($params) {
            $messageSource = new MessageSource($params['app']['messagesPath']);

            return new CategorySource(
                name: 'app',
                reader: $messageSource,
                formatter: new SimpleMessageFormatter(),
                writer: $messageSource, // same source doubles as writer so the extractor can write (§5)
            );
        },
        'tags' => ['translation.categorySource'],
    ],
];
```

The corresponding parameters (application-owned; use a literal path — see the `@messages` note in §4.1):

```php
// config/common/params.php
return [
    'app' => [
        'messagesPath' => dirname(__DIR__, 2) . '/messages',
    ],
];
```

### 2.3. Category Sources

`Yiisoft\Translator\CategorySource` (from `vendor/yiisoft/translator/src/CategorySource.php:22-30`):

```php
public function __construct(
    string $name,                                   // must match /^[a-z0-9_-]+$/i, else RuntimeException
    private MessageReaderInterface $reader,
    private ?MessageFormatterInterface $formatter = null,
    private ?MessageWriterInterface $writer = null,
)
```

Reader/writer contracts (from `vendor/yiisoft/translator/src/MessageReaderInterface.php:23,48` and
`src/MessageWriterInterface.php:36`):

```php
// MessageReaderInterface
public function getMessage(string $id, string $category, string $locale, array $parameters = []): ?string;
public function getMessages(string $category, string $locale): array;
// → ['id1' => ['message' => 'translation', 'comment' => '...'], ...]

// MessageWriterInterface
public function write(string $category, string $locale, array $messages): void;
```

A category source without a writer throws `UnwritableCategorySourceException` on `write()` (message:
`The category source "%s" does not support writing.`) — relevant for gettext (read-only, §4.3) and for the
extractor (§5).

The core package also ships:

- `Yiisoft\Translator\IdMessageReader` — `getMessage()` returns the id unchanged (`:string`, never null);
  `getMessages()` throws `RuntimeException`. Pass messages as ids in code; translations live entirely in
  storage. **It cannot be used as an extractor target** because the extractor requires a working
  `getMessages()` (§5).
- `Yiisoft\Translator\InMemoryMessageSource` — reader + writer over an array; `write()` normalizes plain
  strings to `['id' => ['message' => $string]]`. Handy for tests (§9).

### 2.4. Quick Start (End-to-End Slice)

A minimal runnable vertical slice with the PHP-file backend:

```sh
composer require yiisoft/translator yiisoft/translator-message-php
```

1. Override the translator params (app-level `params.php`) — enable formatting and a sensible fallback:

```php
// config/common/params.php
return [
    'yiisoft/translator' => [
        'locale' => 'en-US',
        'fallbackLocale' => 'en-US',
        'defaultCategory' => 'app',
    ],
    'app' => [
        'messagesPath' => dirname(__DIR__, 2) . '/messages',
    ],
];
```

2. Register the category source and the formatter alias (§2.2 and §3, files
   `config/common/di/translation.php`).

3. Use the translator in a service:

```php
declare(strict_types=1);

use Yiisoft\Translator\TranslatorInterface;

final readonly class OrderService
{
    public function __construct(private TranslatorInterface $translator) {}

    public function statusLine(string $customerName, int $items): string
    {
        return $this->translator->translate(
            'Test string: {str}',
            ['str' => $customerName],
        );
    }
}
```

4. What the built-in formatters produce (verified examples from the package docs and tests):

```php
// SimpleMessageFormatter (docs/guide/en/simple-formatter.md, tests/SimpleMessageFormatterTest.php):
$translator->translate('Test string: {str}', ['str' => 'string data']);
// output: Test string: string data

$translator->translate('{min, plural, one{character} other{characters}}', ['min' => 1]);
// output: character
$translator->translate('{min, plural, one{character} other{characters}}', ['min' => 0]);
// output: characters   (0 → "other": the rule is $value === 1 ? one : other)

// IntlMessageFormatter (docs/guide/en/intl-formatter.md):
$translator->translate('Total {count, number} {count, plural, one{item} other{items}}.', ['count' => 1]);
// output: Total 1 item.
$translator->translate('{gender, select, female{Уважаемая} other{Уважаемый}} {firstname}', ['gender' => null, 'firstname' => 'Vadim'], locale: 'ru');
// output: Уважаемый Vadim
```

For standalone usage (tests, scripts) the same wiring works without the DI container:

```php
declare(strict_types=1);

use Yiisoft\Translator\CategorySource;
use Yiisoft\Translator\Message\Php\MessageSource;
use Yiisoft\Translator\SimpleMessageFormatter;
use Yiisoft\Translator\Translator;

$translator = new Translator(
    locale: 'en-US',
    fallbackLocale: 'en-US',
    defaultCategory: 'app',
);
$translator->addCategorySources(new CategorySource(
    name: 'app',
    reader: $messageSource = new MessageSource('./messages'),
    formatter: new SimpleMessageFormatter(),
    writer: $messageSource,
));

echo $translator->translate('Test string: {str}', ['str' => 'string data']);
```

## 3. Formatters

All implement `MessageFormatterInterface::format(string $message, array $parameters, string $locale): string`
(from `vendor/yiisoft/translator/src/MessageFormatterInterface.php:24`).

| Formatter | Behavior | Notes |
|---|---|---|
| `Yiisoft\Translator\NullMessageFormatter` | returns the message unchanged | **the `Translator` default** |
| `Yiisoft\Translator\SimpleMessageFormatter` | `{name}` replacement; `{name, plural, one{...} other{...}}` with only `one`/`other` keys and integer values; throws `InvalidArgumentException` on missing params | no dependencies; good default for apps |
| `Yiisoft\Translator\IntlMessageFormatter` | full ICU patterns via `ext-intl` (`MessageFormatter::format()`): `{count, plural, ...}`, `{gender, select, ...}`; returns the original message when there are no params or formatting fails | throws `RuntimeException` at construction when `ext-intl` is not loaded; requires ICU ≥ 49 |

`SimpleMessageFormatter` mechanics worth knowing (from
`vendor/yiisoft/translator/src/SimpleMessageFormatter.php:35-111`):

- One pass collects **all** `{...}` blocks (simple placeholders and plural blocks can be mixed in one message);
  the final output is a single `strtr()`.
- Unknown format names (e.g. `{min, notsupported}`) fall back to substituting the raw parameter value.
- Non-scalar parameter values (arrays, objects) are skipped — the placeholder stays literal.
- Missing parameter → `InvalidArgumentException` ("\"$parameter\" parameter's value is missing.").
- Plural: only the keys `one` and `other` exist; the value must be `int` (else `InvalidArgumentException`);
  the rule is `$value === 1 ? one : other`, so **0 renders as "other"**; missing `one` or `other` key →
  `InvalidArgumentException`.

To use a real formatter application-wide, alias the interface in application configuration (e.g.
`config/common/di/translation.php` in app templates; documented in the package's `intl-formatter.md` /
`simple-formatter.md` guides — the package itself does not bind it):

```php
use Yiisoft\Translator\IntlMessageFormatter;
use Yiisoft\Translator\MessageFormatterInterface;

return [
    MessageFormatterInterface::class => IntlMessageFormatter::class,
];
```

## 4. Message Storage Backends

As a documentation-level rule of thumb (not a package-enforced mechanism): pick **one primary reader** per
deployment and register its category source through the `translation.categorySource` tag (§2.2). All three
backends read per `{category}` × `{locale}`.

### 4.1. PHP Files (`translator-message-php`)

`Yiisoft\Translator\Message\Php\MessageSource` — implements **reader + writer**; constructor:
`__construct(private string $path)` (storage root; no validation — a missing directory is not an error until a
write happens). Layout: `{path}/{locale}/{category}.php`
(from `vendor/yiisoft/translator-message-php/src/MessageSource.php:27,73,77`). No shipped config — define the
service yourself with a **literal path**:

```php
MessageSource::class => [
    'class' => MessageSource::class,
    '__construct()' => ['path' => $params['app']['messagesPath']],
],
```

> [!IMPORTANT]
> There is no `@messages` alias in any of the translation packages — their READMEs use literal paths. Either
> pass a literal path / params-derived path as above, or define your own alias with `yiisoft/aliases` at the
> application level before using an alias string.

Locale codes are validated against `/^[a-z0-9_-]+$/i` — OS-style dotted locales such as `en_US.UTF-8` are
**invalid** here (`src/MessageSource.php:69-71`). Contrast with gettext, which *requires* the OS convention
(§4.3).

`write()` details (`src/MessageSource.php:56-65,74`): `file_put_contents(..., LOCK_EX)`; the locale directory is
created with mode `0775`; the whole file is overwritten (no read-merge — run the extractor §5 instead of writing
partial sets).

File format as generated by `write()` (from `src/MessageSource.php:103-148`; comments are emitted **inside the
array, immediately above each entry**):

```php
<?php
return [
    /* Comment for message 1 */
    'test.id1' => 'Nachricht 1',
    'test.id2' => 'Nachricht 2',
];
```

- An empty write produces `<?php\nreturn []\n` (no trailing semicolon).
- Comments are **not** round-tripped: reads return `['id' => ['message' => ...]]` without the comment key.
- Reads are cached per instance; `write()` does not refresh that cache.

Best for small/medium apps: translations are version-controlled, opcache-friendly, and editable by the extractor
(§5).

### 4.2. Database (`translator-message-db`)

`Yiisoft\Translator\Message\Db\MessageSource` — reader + writer; constructor (from
`vendor/yiisoft/translator-message-db/src/MessageSource.php:39-45`):

```php
public function __construct(
    private ConnectionInterface $db,          // Yiisoft\Db\Connection\ConnectionInterface
    private ?CacheInterface $cache = null,    // optional Yiisoft\Cache\CacheInterface (PSR-16 wrapper), default null
    private string $sourceMessageTable = '{{%yii_source_message}}',
    private string $messageTable = '{{%yii_message}}',
    private int $cachingDuration = 3600,      // int — passing null is a TypeError
)
```

The dependency packages and their wiring:

#### Database connection (`yiisoft/db`)

`ConnectionInterface` lives in `vendor/yiisoft/db/src/Connection/ConnectionInterface.php`. Exactly one driver
package must be installed (`yiisoft/db-mysql`, `-pgsql`, `-sqlite`, `-mssql`, `-oracle`). Official DI recipe
(from the `yiisoft/db` docs, `docs/guide/en/connection/mysql.md`):

```php
// config/common/di/db-mysql.php
declare(strict_types=1);

use Yiisoft\Db\Connection\ConnectionInterface;
use Yiisoft\Db\Mysql\Connection;
use Yiisoft\Db\Mysql\Driver;

/** @var array $params */

return [
    ConnectionInterface::class => [
        'class' => Connection::class,
        '__construct()' => [
            'driver' => new Driver(
                $params['yiisoft/db-mysql']['dsn'],
                $params['yiisoft/db-mysql']['username'],
                $params['yiisoft/db-mysql']['password'],
            ),
        ],
    ],
];
```

```php
// config/common/params.php
use Yiisoft\Db\Mysql\Dsn;

return [
    'yiisoft/db-mysql' => [
        'dsn' => new Dsn('mysql', '127.0.0.1', 'yiitest', '3306', ['charset' => 'utf8mb4']),
        'username' => 'user',
        'password' => 'password',
    ],
];
```

#### Cache wiring (`yiisoft/cache`)

`Yiisoft\Cache\CacheInterface` is a wrapper **over** PSR-16 (adds `psr()` access, TTL handling, stampede
protection via `getOrSet(key, callable, ttl, dependency, beta)`). The DB message source needs this wrapper, not
a bare `Psr\SimpleCache\CacheInterface` object (import at
`vendor/yiisoft/translator-message-db/src/MessageSource.php:10`; see
`vendor/yiisoft/cache/src/CacheInterface.php:14-24`).

`yiisoft/cache` ships `config/di.php` binding both layers (`vendor/yiisoft/cache/config/di.php:11-12`):

```php
Yiisoft\Cache\CacheInterface::class => Cache::class,               // Yiisoft\Cache\Cache
Psr\SimpleCache\CacheInterface::class => ArrayCache::class,        // request-scoped default store
```

The default PSR-16 store (`ArrayCache`) lives only for the current request — override it with a persistent store
in production (`yiisoft/cache-file` or `yiisoft/cache-redis`; see [Caching Guide](persistence-caching.md)):

```php
// config/common/di/cache.php — production override example
declare(strict_types=1);

use Psr\SimpleCache\CacheInterface;
use Yiisoft\Cache\File\FileCache;

return [
    CacheInterface::class => FileCache::class,
];
```

Caching behavior of the message source (`src/MessageSource.php:160-167,210-216`): reads are wrapped in
`CacheInterface::getOrSet()` with `$this->cachingDuration` as the TTL and the key
`md5(json_encode([self::class, $category, $locale], JSON_THROW_ON_ERROR))`; when `$cache` is `null`, caching is
skipped entirely. Passing `null` as the *duration* is a `TypeError` — `$cachingDuration` is typed `int` (the
README's "If set to null, default value is used - 3600" comment is wrong).

#### Schema creation

Tables are **not** created automatically. Two verified options:

1. `Yiisoft\Translator\Message\Db\DbSchemaManager::ensureTables()` (constructor takes `ConnectionInterface`;
   also `ensureNoTables()`) — `vendor/yiisoft/translator-message-db/src/DbSchemaManager.php:18-78`.
2. A migration via `yiisoft/db-migration` (no base `Migration` class exists — migrations implement
   `MigrationInterface` / `RevertibleMigrationInterface` with `up(MigrationBuilder $b): void` /
   `down(MigrationBuilder $b): void`; `vendor/yiisoft/db-migration/src/RevertibleMigrationInterface.php:15-27`).
   Commands `migrate:up`, `migrate:create`, `migrate:down`, `migrate:history`, `migrate:new`, `migrate:redo`,
   `migrate:mark` are registered by the package's `config/params.php` under the `yiisoft/yii-console` `commands`
   param.

```php
// A revertible migration creating the translation schema.
declare(strict_types=1);

use Yiisoft\Db\Constant\ReferentialAction;
use Yiisoft\Db\Migration\MigrationBuilder;
use Yiisoft\Db\Migration\RevertibleMigrationInterface;

final class M250101000000CreateTranslationTables implements RevertibleMigrationInterface
{
    public function up(MigrationBuilder $b): void
    {
        $columnBuilder = $b->columnBuilder();

        $b->createTable('{{%yii_source_message}}', [
            'id' => $columnBuilder::bigPrimaryKey(),
            'category' => $columnBuilder::string(255),
            'message_id' => $columnBuilder::text(),
            'comment' => $columnBuilder::text(),
        ]);
        $b->createIndex('{{%yii_source_message}}', 'IDX_yii_source_message_category', 'category');

        $b->createTable('{{%yii_message}}', [
            'id' => $columnBuilder::integer(),
            'locale' => $columnBuilder::string(16),
            'translation' => $columnBuilder::text(),
            'PRIMARY KEY(id, locale)', // composite PK via raw definition string (same pattern as the
                                        // `migrate:create` generator output for composite keys)
        ]);
        $b->createIndex('{{%yii_message}}', 'IDX_yii_message_locale', 'locale');

        $b->addForeignKey(
            '{{%yii_message}}',
            'FK_yii_source_message_yii_message',
            'id',
            '{{%yii_source_message}}',
            'id',
            delete: ReferentialAction::CASCADE,
            update: ReferentialAction::RESTRICT,
        );
    }

    public function down(MigrationBuilder $b): void
    {
        $b->dropTable('{{%yii_message}}');
        $b->dropTable('{{%yii_source_message}}');
    }
}
```

(`$b->columnBuilder()` returns the driver's `Yiisoft\Db\Schema\Column\ColumnBuilder` class name;
`addForeignKey(..., ?string $delete = null, ?string $update = null)` accepts `ReferentialAction::*` —
`vendor/yiisoft/db-migration/src/MigrationBuilder.php:48,509-517`; `ReferentialAction` constants:
`vendor/yiisoft/db/src/Constant/ReferentialAction.php:25-45`.)

For reference, the package's own MySQL DDL (`vendor/yiisoft/translator-message-db/sql/mysql-up.sql:1-15`;
`sql/` ships the same up/down pairs for mysql, oci, pgsql, sqlite, sqlsrv):

```sql
CREATE TABLE `yii_source_message` (
	`id` int(11) NOT NULL AUTO_INCREMENT PRIMARY KEY,
	`category` varchar(255),
	`message_id` text,
	`comment` text
);
CREATE TABLE `yii_message` (
	`id` int(11) NOT NULL,
	`locale` varchar(16) NOT NULL,
	`translation` text,
    CONSTRAINT `PK_yii_message_id_locale` PRIMARY KEY (`id`, `locale`),
    CONSTRAINT `FK_yii_source_message_yii_message` FOREIGN KEY (`id`) REFERENCES `yii_source_message` (`id`) ON DELETE CASCADE ON UPDATE RESTRICT
);
CREATE INDEX `IDX_yii_source_message_category` ON `yii_source_message` (`category`);
CREATE INDEX `IDX_yii_message_locale` ON `yii_message` (`locale`);
```

Behavior notes (from `vendor/yiisoft/translator-message-db/src/MessageSource.php`):

- Reads `INNER JOIN` `yii_source_message` × `yii_message` with `indexBy('message_id')`; the `comment` key is
  omitted when empty; missing id → `null`.
- `write()` loads existing source ids, inserts missing sources (`comment` defaults to `''`), then upserts
  missing/changed translations; payload validation errors throw `InvalidArgumentException`; no transaction
  wrapping.

> [!WARNING]
> The package README's "with caching" example passes `$cacheDuration` as the **3rd positional argument** — the
> actual 3rd parameter is `$sourceMessageTable` (a string). And a `null` "duration" would be a `TypeError`, not
> a default. Use named arguments (`cache:`, `cachingDuration:`) when wiring; `src/MessageSource.php` is ground
> truth.

### 4.3. Gettext (`translator-message-gettext`)

`Yiisoft\Translator\Message\Gettext\MessageSource` — **read-only** (implements `MessageReaderInterface` only);
requires `ext-gettext`; constructor `__construct(private string $path)` throws
`RuntimeException('Directory "%s" does not exist.')` when the directory is missing
(`vendor/yiisoft/translator-message-gettext/src/MessageSource.php:15,22-28`).

- Catalog layout: `{path}/{locale}/LC_MESSAGES/{category}.mo` — the category acts as the gettext **domain**
  (`bindtextdomain($category, $this->path)`); domains are bound once per category per instance. Compiled `.mo`
  files are created with external tools (e.g. Poedit); `getMessages()` is unsupported — throws
  `RuntimeException('Unable to get all messages from gettext.')` (`src/MessageSource.php:46-56`).
- Plural handling: when the **first element** of `$parameters` (`current($parameters)`, regardless of its array
  key) is an `int`, `dngettext($category, $id, $id, $n)` is used; otherwise `dgettext($category, $id)`
  (`src/MessageSource.php:33,39-43`).
- Every `getMessage()` call runs `setlocale(LC_ALL, $locale)` — a **process-global** side effect; failure throws
  `RuntimeException` (`src/MessageSource.php:58-63`). Locale strings must match the OS convention:
  Windows `en-US.UTF-8`, Linux `en_US.UTF-8` (README "Attention"). Contrast with the PHP backend, which
  *forbids* dotted forms (§4.1).

## 5. Message Extraction (`translator-extractor`)

Console command `translator/extract` (from
`vendor/yiisoft/translator-extractor/src/Command/ExtractCommand.php:18,31-42,57,64`):

```sh
./yii translator/extract [path]                # default path: getcwd()
./yii translator/extract --except=''           # include vendor/ (see below)
# -L|--languages 'en'   single value, default 'en'; comma-separated list is exploded
# -C|--category 'app'   single value, default 'app'
# -O|--only             multi-value (may be repeated) — restrict extraction paths
# -E|--except           multi-value (may be repeated) — exclude paths
```

Registration and the empty-config trap:

- The command name is registered by the package's `config/params.php` under the `yiisoft/yii-console` `commands`
  param.
- The package's `config/di-console.php` defines `Extractor::class` with an **empty category list**, so running
  the command fails with `NoCategorySourceConfigException` until the application overrides the `Extractor`
  definition (`vendor/yiisoft/translator-extractor/src/Extractor.php:36-40`).

Override example (application console DI; the extractor's `CategorySource` is its own class —
`Yiisoft\TranslatorExtractor\CategorySource`, constructor
`(string $name, MessageReaderInterface $reader, MessageWriterInterface $writer)`, writer required, no formatter
— distinct from `Yiisoft\Translator\CategorySource`):

```php
// config/console/di/extractor.php
declare(strict_types=1);

use Yiisoft\Definitions\DynamicReference;
use Yiisoft\Translator\Message\Php\MessageSource;
use Yiisoft\TranslatorExtractor\CategorySource as ExtractorCategorySource;
use Yiisoft\TranslatorExtractor\Extractor;

/** @var array $params */

return [
    Extractor::class => [
        '__construct()' => [
            [
                new ExtractorCategorySource(
                    'app',
                    DynamicReference::to([
                        'class' => MessageSource::class,
                        '__construct()' => ['path' => $params['yiisoft/translator-extractor']['messagePath']],
                    ]),
                    DynamicReference::to([
                        'class' => MessageSource::class,
                        '__construct()' => ['path' => $params['yiisoft/translator-extractor']['messagePath']],
                    ]),
                ),
            ],
            '->translate',
        ],
    ],
];
```

```php
// config/console/params.php
return [
    'yiisoft/translator-extractor' => [
        'messagePath' => dirname(__DIR__, 3) . '/messages',
    ],
];
```

> [!IMPORTANT]
> Reader and writer must be backed by **the same** `MessageSource` instance type/parameters — the extractor
> reads existing messages to merge into them (package README note).

Extraction semantics (verified against `vendor/yiisoft/translator-extractor/src/Extractor.php` and the core
`Yiisoft\Translator\Extractor\*` classes):

- Scan targets: token-based search (`token_get_all`) for the configured call string (default `->translate`);
  the 1st argument is the id, the 2nd the parameters, the 3rd the category. Only **literal string ids** are
  extracted — calls with non-literal ids are silently skipped and only visible via the in-process
  `getSkippedLines()` API, which the console command does not report.
- Merge rule: `array_merge($messages, $readMessages)` — **existing translations always win**; only new ids are
  appended, and each new id is stored with the id itself as its message (`['id' => ['message' => 'id']]`).
  The extractor never overwrites existing translations.
- Category routing: an unknown category falls back to the default category; if the default category is not
  configured either, a warning is emitted and processing stops.
- Default exclusion is `./vendor/**` (application root). `--except=''` resets it; an empty `--only`/`--except`
  list is ignored (keeps the previous value).
- The command always exits with code `0` on normal completion paths — do not use the exit code as a success
  signal.
- Target requirements: the category source's reader must support `getMessages()` — `IdMessageReader` is **not
  usable** as an extractor target (its `getMessages()` throws). The **gettext backend is not supported** as an
  extraction target (no writer, `getMessages()` throws); the package README documents the `xgettext`/`msgmerge`
  workaround instead.

## 6. Locale Handling

### 6.1. Locale Value Object (`yiisoft/i18n`)

`Yiisoft\I18n\Locale` — immutable BCP 47 parser (`final class Locale implements Stringable`). The constructor
validates the string against the BCP 47 regex and throws
`InvalidArgumentException($localeString . ' is not valid BCP 47 formatted locale string.')` on invalid input
(`vendor/yiisoft/i18n/src/Locale.php:115-119`).

Complete public API (verified by enumerating all `public function` declarations in `src/Locale.php`; there are
no other public methods):

- 13 accessors, each with a matching `with*()` immutable setter:
  `language`, `script`, `region`, `variant`, `extendedLanguage`, `private`, `currency`, `calendar`,
  `colcasefirst`, `collation`, `colnumeric`, `numbers`, `hours`;
- `asString(): string` and `__toString(): string`;
- `fallbackLocale(): self` (below).

There is **no** public accessor or wither for `extension` / `grandfathered` — both are parsed and stored, but
exposed only through `asString()`.

Normalization applied while parsing: language lowercased (`EN` → `en`), region uppercased (`fr-ca` → `CA` for
the region part), script ucfirst (`zh-hANS` → `Hans`). ICU keywords become accessor values: e.g.
`en-US-u-ca-buddhist` exposes `calendar(): 'buddhist'`.

`fallbackLocale()` mechanics (`vendor/yiisoft/i18n/src/Locale.php:527-553`):

1. First it nulls all ICU keywords (`calendar`, `colcasefirst`, `collation`, `colnumeric`, `currency`,
   `numbers`, `hours`) plus `extendedLanguage` and `private`.
2. Then it strips **exactly one** structural subtag per call, in priority order: variant → region → script.

A single call does not cascade — chain by repeated application (verified in
`vendor/yiisoft/i18n/tests/LocaleTest.php:283-307`):

```php
use Yiisoft\I18n\Locale;

$locale = new Locale('en-GB-boont-x-private');
(string) $locale->fallbackLocale();            // 'en-GB'
(string) $locale->fallbackLocale()->fallbackLocale();      // 'en'
(string) $locale->fallbackLocale()->fallbackLocale()->fallbackLocale(); // 'en' (no further change)

(new Locale('zh-Hans'))->fallbackLocale()->asString(); // 'zh'
```

`Yiisoft\I18n\LocaleProvider` — stateful holder for the current locale
(`vendor/yiisoft/i18n/src/LocaleProvider.php:11-33`): `__construct(private Locale $defaultLocale)`,
`get(): Locale`, `set(Locale $locale): void`, `isDefaultLocale(): bool` (string-value comparison). Use it as
the per-request locale source for services that need the locale without depending on the translator. The
package ships no DI config.

### 6.2. Locale Middleware (`yii-middleware`)

`Yiisoft\Yii\Middleware\Locale` (PSR-15) must be placed **before** the `Route` middleware
(docblock, `vendor/yii-middleware/src/Locale.php:36`). Constructor (from `src/Locale.php:64-77`):

```php
public function __construct(
    private EventDispatcherInterface $eventDispatcher,
    private UrlGeneratorInterface $urlGenerator,
    private LoggerInterface $logger,
    private ResponseFactoryInterface $responseFactory,
    array $supportedLocales = [],                   // ['ru' => 'ru-RU'] — KEY = URL prefix, VALUE = locale
    private array $ignoredRequestUrlPatterns = [],  // wildcard patterns to skip entirely
    private bool $secureCookie = false,
    private ?DateInterval $cookieDuration = null,   // null → never save the locale cookie
    private ?ClockInterface $clock = null,
)
```

Locale resolution priority (from `src/Locale.php:79-131`): **URL path prefix** (`/de/blog`) → **query
parameter** `_language` (customizable via `withQueryParameterName()`) → **cookie** `_language` (only when
`$cookieDuration !== null`; `withCookieName()`) → **`Accept-Language` header** (only after
`withDetectLocale(true)`). When `supportedLocales` is empty or the request matches an ignored pattern, the
middleware passes through untouched. Invalid map formats throw `InvalidLocalesFormatException` at construction
/configuration time, not during resolution.

Redirects (302): for GET requests the default locale's prefix is stripped (`/en-US/blog` → `/blog`, cookie
saved); a non-default prefix is added when missing. Non-GET requests proceed without URL rewriting.

> [!IMPORTANT]
> The middleware does **not** call `TranslatorInterface::setLocale()` and does not touch `LocaleProvider`
> (verified: zero references to translator/i18n in the middleware sources). Instead, for every request resolved
> to a **non-default** locale it:
> 1. dispatches `Yiisoft\Yii\Middleware\Event\SetLocaleEvent` carrying the locale **value** from the map —
>    e.g. `'ru-RU'` for prefix key `ru` — before the request handler runs;
> 2. calls `$this->urlGenerator->setDefaultArgument('_language', 'ru')` with the locale **key** — or
>    `setDefaultArgument('_language', null)` for the default locale, resetting the argument.
>
> The application wires a `SetLocaleEvent` listener to propagate the locale (§7).

URL generation behavior (`yiisoft/router` + `yiisoft/router-fastroute`):

- `UrlGeneratorInterface::setDefaultArgument(string $name, bool|float|int|string|Stringable|null $value)`
  (`vendor/yiisoft/router/src/UrlGeneratorInterface.php:93`) — this is the only coupling point; the `_language`
  name is defined in `yii-middleware`, the router itself has no locale feature.
- The FastRoute implementation casts the default to `string` and rejects non-scalar values; defaults are merged
  **before** per-`generate()` arguments, so any call may override `_language` explicitly. Default arguments are
  reset per request via the DI `reset` closure (long-running-worker safety).
- Arguments not consumed by the route become query parameters — a stale `_language` default would surface as
  `?_language=ru` on locale-agnostic routes.

Registration (no config ships with `yii-middleware`; the README documents the fluent `with*()` API —
`withSupportedLocales(['en' => 'en-US', 'ru' => 'ru-RU'])`, `withIgnoredRequestUrlPatterns(['/api**'])`,
`withCookieDuration(new DateInterval('P30D'))`, optional `withCookieName()` / `withSecureCookie()`). The
params-style DI registration below is an application-level convention:

```php
// config/common/di/middleware.php — insert into the middleware stack before Route
use Yiisoft\Yii\Middleware\Locale;

return [
    Locale::class => [
        '__construct()' => [
            'supportedLocales' => ['en' => 'en-US', 'ru' => 'ru-RU'],
            'cookieDuration' => new DateInterval('P30D'),
        ],
    ],
];
```

## 7. Missing Translation Events

Events are **optional by design**: the translator's `$eventDispatcher` is nullable, the shipped DI wiring uses
`Reference::optional(EventDispatcherInterface::class)`, and dispatch calls are null-safe. Without a configured
dispatcher, translation still works — events simply do not fire.

When a message or category cannot be resolved **and** a dispatcher is configured:

| Event | Getters | Meaning |
|---|---|---|
| `Yiisoft\Translator\Event\MissingTranslationEvent` | `getCategory()`, `getLanguage()`, `getMessage()` | the id was not found in any source for that locale (fires per source per locale attempt, including fallback locales; note the getter is `getLanguage()`, not `getLocale()`) |
| `Yiisoft\Translator\Event\MissingTranslationCategoryEvent` | `getCategory()` | no source registered for the category (fires **at most once per category per translator instance**) |

Listener wiring follows the `yiisoft/yii-event` events configuration format (array keyed by event class name;
parameters after the first — the event itself — are resolved from the DI container). A typical application
pattern is logging gaps to a dedicated channel (e.g. `translation.missing` — see
[Logging Guide](infra-logging.md)) so untranslated strings surface in monitoring:

```php
// config/common/events.php — application events configuration (format: yiisoft/yii-event)
declare(strict_types=1);

use Psr\Log\LoggerInterface;
use Yiisoft\Translator\Event\MissingTranslationEvent;
use Yiisoft\Translator\TranslatorInterface;
use Yiisoft\Yii\Middleware\Event\SetLocaleEvent;

return [
    MissingTranslationEvent::class => [
        static function (MissingTranslationEvent $event, LoggerInterface $logger): void {
            $logger->warning(
                'Missing translation: category={category}, locale={locale}, id={id}',
                [
                    'category' => $event->getCategory(),
                    'locale' => $event->getLanguage(),
                    'id' => $event->getMessage(),
                ],
            );
        },
    ],
    SetLocaleEvent::class => [
        static function (SetLocaleEvent $event, TranslatorInterface $translator): void {
            $translator->setLocale($event->getLocale());
        },
    ],
];
```

An invokable handler class works as well (the shape documented by `yii-middleware`'s README):

```php
declare(strict_types=1);

use Yiisoft\Translator\TranslatorInterface;
use Yiisoft\Yii\Middleware\Event\SetLocaleEvent;

final readonly class SetLocaleEventHandler
{
    public function __construct(private TranslatorInterface $translator) {}

    public function handle(SetLocaleEvent $event): void
    {
        $this->translator->setLocale($event->getLocale());
    }
}
// registered as: SetLocaleEvent::class => [SetLocaleEventHandler::class]
```

## 8. Ecosystem Integration Boundaries

Verified absences — none of the following packages integrates with the translator. Do not expect automatic
localization from them:

- **`yiisoft/view`** — no translator integration (no occurrences of translator/i18n in its sources, no
  composer dependency). Its only locale feature is **view-file localization**: `ViewInterface::withSourceLocale()`,
  `setLocale()`, `withLocale()`, `getLocale()`, and `localize(string $file, ?string $locale = null,
  ?string $sourceLocale = null): string` look up templates in `{dir}/{locale}/file.php` with a fallback from
  full locale to language-only code (e.g. `zh-CN` → `zh`). Translate messages with the translator before
  rendering, or pass `TranslatorInterface` into templates as a render parameter at the application level
  (see [Views Guide](http-views-and-widgets.md)).
- **`yiisoft/mailer`** — no i18n/translator integration. Translate the subject and body **before** building the
  message: `withSubject()`, `withTextBody()`, `withHtmlBody()` on `MessageInterface`; sending via
  `MailerInterface::send()` / `sendMultiple()`. The development mock `FileMailer` writes `.eml` files
  (params `yiisoft/mailer` → `fileMailer` → `path`) (see [Mailer Guide](infra-mailer.md)).
- **`yiisoft/error-handler`** — no i18n integration; the shipped error-page templates hardcode
  `<html lang="en">`. The sanctioned user-facing path is `Yiisoft\ErrorHandler\Exception\UserException`
  (either thrown directly or attached to any exception class as the `#[UserException]` class attribute; checked
  via `UserException::isUserException()`) — translate the message **at throw time** in application code.
  A custom `ThrowableRendererInterface` implementation is the extension point for localized error pages
  (see [Error Handling Guide](infra-error-handling.md)).

## 9. Testing the Translator

There is no translation-specific mock package. Doubles come from two places: `yiisoft/translator` itself ships
`InMemoryMessageSource` (reader + writer), and `yiisoft/test-support` ships generic PSR doubles —
`SimpleEventDispatcher` (records every dispatched event; `getEvents()`, `getEventClasses()`, `clearEvents()`,
`isClassTriggered(string $class, ?int $times = null): bool`, ...), `SimpleLogger` (`getMessages()`), and
`MemorySimpleCache`.

A self-contained test setup (named arguments; `Translator` constructor verified in §2.2):

```php
declare(strict_types=1);

use Yiisoft\Test\Support\EventDispatcher\SimpleEventDispatcher;
use Yiisoft\Translator\CategorySource;
use Yiisoft\Translator\Event\MissingTranslationEvent;
use Yiisoft\Translator\InMemoryMessageSource;
use Yiisoft\Translator\SimpleMessageFormatter;
use Yiisoft\Translator\Translator;

$dispatcher = new SimpleEventDispatcher();
$source = new InMemoryMessageSource();
$source->write('app', 'de', [
    'hello' => 'Hallo',
    'items' => ['message' => '{min, plural, one{Element} other{Elemente}}'],
]);

$categorySource = new CategorySource(
    name: 'app',
    reader: $source,
    formatter: new SimpleMessageFormatter(),
    writer: $source,
);

$translator = new Translator(
    locale: 'de',
    fallbackLocale: null,
    defaultCategory: 'app',
    eventDispatcher: $dispatcher,
    defaultMessageFormatter: new SimpleMessageFormatter(),
);
$translator->addCategorySources($categorySource);

// assertions:
$translator->translate('hello');                 // 'Hallo'
$translator->translate('items', ['min' => 1]);   // 'Element'
$dispatcher->isClassTriggered(MissingTranslationEvent::class); // false — 'hello' resolved
$translator->translate('unknown-id');
$dispatcher->isClassTriggered(MissingTranslationEvent::class); // true — id not found
```

`InMemoryMessageSource::write()` accepts both shapes — plain strings
(`['id' => 'msg']`) and full arrays (`['id' => ['message' => 'msg', 'comment' => '...']]`) — and normalizes
plain strings internally.

## 10. Anti-Pattern Matrix

| Forbidden Anti-Pattern | Why it breaks | Idiomatic Yii3 Solution |
|---|---|---|
| Yii2-style `Yii::t('app', 'Hello')` | Static facade does not exist in Yii3 | Inject `TranslatorInterface`; call `->translate('hello', [...], 'app')` (§2.1) |
| Expecting `{placeholder}` substitution with default config | The default formatter is `NullMessageFormatter` — placeholders stay literal | Alias `MessageFormatterInterface::class` to `SimpleMessageFormatter` or `IntlMessageFormatter` (§3) |
| Inventing a `GettextMessageFormatter` class | Does not exist; gettext support is a message reader, not a formatter | Use the reader with any formatter (§4.3) |
| Copying README/`config/di.php` examples positionally | Both shipped examples are stale: `Translator` 3rd positional is now `$defaultCategory` (TypeError with a dispatcher); `CategorySource` example swaps reader/formatter | Use named arguments; verify against `src/` (§2.2) |
| Passing `Psr\SimpleCache\CacheInterface` as the DB source's `$cache` | The parameter is `Yiisoft\Cache\CacheInterface` — a PSR-16 wrapper, not PSR-16 itself | Wire `Yiisoft\Cache\CacheInterface => Cache` (shipped by `yiisoft/cache`) or install `yiisoft/cache`'s default config (§4.2) |
| Positional constructor args for `translator-message-db`, or `null` as caching duration | 3rd positional is `$sourceMessageTable`, not the duration; `$cachingDuration` is `int` — `null` is a `TypeError` | Use named arguments (`cache:`, `cachingDuration:`) (§4.2) |
| Writing translations via a gettext source | `MessageSource` is read-only — `write()` is impossible | Use the PHP or DB backend as writer; gettext for consumption only (§4.3) |
| Using `IdMessageReader` as an extraction target | The extractor needs `getMessages()`, which `IdMessageReader` only implements by throwing | Point the extractor at a real reader+writer backend (§5) |
| Expecting the extractor to pick up dynamic ids or to update translations | Only literal string ids are extracted (skipped ones are not reported); existing translations always win over extracted ids | Use literal ids in code; treat extraction as append-only (§5) |
| Treating the extractor's exit code as a success signal | The command always returns `0` on normal paths | Check the output / resulting message files instead (§5) |
| Running `translator/extract` with shipped config | `Extractor` is wired with an empty category list → `NoCategorySourceConfigException` | Override the `Extractor` DI definition with your category source(s) (§5) |
| Assuming locale middleware configures the translator | It only dispatches `SetLocaleEvent` (value) and sets the URL generator default argument (key) | Add a `SetLocaleEvent` listener calling `$translator->setLocale()` (§6.2, §7) |
| Registering `Locale` middleware after `Route` | Routing already happened; locale prefix in URLs is never parsed | Place `Locale` before `Route` in the middleware stack (§6.2) |
| Expecting view/mailer/error-handler to localize automatically | None of them integrates with the translator; error templates hardcode `lang="en"` | Translate before building: render params, `withSubject()`/`withTextBody()`, `#[UserException]` at throw time (§8) |
| Storing translator locale in static state / globals | No statics in Yii3; breaks worker-mode isolation | Use `TranslatorInterface::setLocale()` per request, driven by middleware events; `LocaleProvider` for other services (§2.2, §7) |
| Using an undefined `@messages` alias for message paths | No translation package defines or resolves it | Pass a literal / params-derived path, or define the alias yourself with `yiisoft/aliases` (§4.1) |
| Ignoring `MissingTranslationEvent` | Untranslated strings surface to users as raw ids | Log gaps via a listener (§7); set `fallbackLocale` sensibly (§2.2) |
