# Yii3 Internationalization & Translation Guide

> Practical guide for message translation with `yiisoft/translator`, locale handling with `yiisoft/i18n`,
> storage backends (`translator-message-php/db/gettext`), message extraction with `translator-extractor`,
> and locale routing with `Yiisoft\Yii\Middleware\Locale`.

---

## Table of Contents
- [1. Package Map](#1-package-map)
- [2. Core Translation API (`yiisoft/translator`)](#2-core-translation-api-yiisofttranslator)
  - [2.1. TranslatorInterface](#21-translatorinterface)
  - [2.2. DI Wiring](#22-di-wiring)
  - [2.3. Category Sources](#23-category-sources)
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
- [8. Anti-Pattern Matrix](#8-anti-pattern-matrix)

---

## 1. Package Map

| Package | Role |
|---|---|
| `yiisoft/translator` | Translation engine: `TranslatorInterface`, `CategorySource`, formatters, missing-translation events, `IdMessageReader`, `InMemoryMessageSource`. Requires `yiisoft/i18n`. |
| `yiisoft/i18n` | **Only two classes**: the BCP 47 `Locale` value object and the stateful `LocaleProvider`. No formatters, no category logic — everything else lives in `yiisoft/translator`. |
| `yiisoft/translator-message-php` | Reader + writer over PHP array files (`messages/{locale}/{category}.php`) |
| `yiisoft/translator-message-db` | Reader + writer over a database (`yii_source_message` + `yii_message` tables, optional cache) |
| `yiisoft/translator-message-gettext` | Read-only reader over compiled gettext catalogs (`.mo`), requires `ext-gettext` |
| `yiisoft/translator-extractor` | Console command `translator/extract` that scans source code for `->translate` calls |
| `yiisoft/yii-middleware` | `Yiisoft\Yii\Middleware\Locale` — locale-based routing middleware (same package also ships CORS and others) |

> [!IMPORTANT]
> `yiisoft/i18n-message-php` and `yiisoft/i18n-message-gettext` are **not separate packages** — their
> `composer.json` declares the names `yiisoft/translator-message-php` / `yiisoft/translator-message-gettext`
> (the cloned sources are identical). Do not `composer require yiisoft/i18n-message-*`; there is also no
> `GettextMessageFormatter` class anywhere.

## 2. Core Translation API (`yiisoft/translator`)

### 2.1. TranslatorInterface

Complete interface (from `src/TranslatorInterface.php`):

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

Inject `Yiisoft\Translator\TranslatorInterface` into services. There is no `getCategory()` method.

Translation resolution order in `translate()`: category sources (multiple sources per category are tried
**last to first**) → `MissingTranslationEvent` when the message id is not found → locale fallback
(`Yiisoft\I18n\Locale::fallbackLocale()`: strips variant → region → script) → the configured `fallbackLocale` →
finally the raw id is formatted as-is.

### 2.2. DI Wiring

The package ships `config/di.php` + `config/params.php`. Defaults (`config/params.php`, verbatim):

```php
return [
    'yiisoft/translator' => [
        'locale' => 'en-US',
        'fallbackLocale' => null,
        'defaultCategory' => 'app',
    ],
];
```

`Translator` constructor (from `src/Translator.php`):

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
> The default formatter is `NullMessageFormatter` — messages are returned **unformatted** (no `{placeholder}`
> substitution) unless an alias is configured (§3). Setting `'fallbackLocale' => 'en-US'` is the usual production
> choice so untranslated strings fall back to English instead of showing raw ids.

Category sources are attached through the **`translation.categorySource` tag** — the shipped `config/di.php`
calls `'addCategorySources()' => ['categories' => Reference::to('tag@translation.categorySource')]`. The
application tags its own `CategorySource` services:

```php
// config/common/di/translation.php
declare(strict_types=1);

use Yiisoft\Definitions\DynamicReference;
use Yiisoft\Translator\CategorySource;
use Yiisoft\Translator\Message\Php\MessageSource;
use Yiisoft\Translator\SimpleMessageFormatter;

return [
    CategorySource::class . 'app' => [
        'class' => CategorySource::class,
        '__construct()' => [
            'name' => 'app',
            'reader' => DynamicReference::to([
                'class' => MessageSource::class,
                '__construct()' => ['path' => $params['app.messages.path']],
            ]),
            'formatter' => new SimpleMessageFormatter(),
        ],
        'tags' => ['translation.categorySource'],
    ],
];
```

### 2.3. Category Sources

`Yiisoft\Translator\CategorySource` (from `src/CategorySource.php`):

```php
public function __construct(
    string $name,                                   // must match /^[a-z0-9_-]+$/i, else RuntimeException
    private MessageReaderInterface $reader,
    private ?MessageFormatterInterface $formatter = null,
    private ?MessageWriterInterface $writer = null,
)
```

Reader/writer contracts:

```php
// MessageReaderInterface
public function getMessage(string $id, string $category, string $locale, array $parameters = []): ?string;
public function getMessages(string $category, string $locale): array;
// → ['id1' => ['message' => 'translation', 'comment' => '...'], ...]

// MessageWriterInterface
public function write(string $category, string $locale, array $messages): void;
```

A category source without a writer throws `UnwritableCategorySourceException` on `write()` — relevant for
gettext (read-only, §4.3) and for the extractor (§5).

The core package also ships `Yiisoft\Translator\IdMessageReader` (returns the id unchanged — pass messages as
ids in code, translations live entirely in storage) and `InMemoryMessageSource` (reader + writer over an array,
handy for tests).

## 3. Formatters

All implement `MessageFormatterInterface::format(string $message, array $parameters, string $locale): string`.

| Formatter | Behavior | Notes |
|---|---|---|
| `Yiisoft\Translator\NullMessageFormatter` | returns the message unchanged | **the `Translator` default** |
| `Yiisoft\Translator\SimpleMessageFormatter` | `{name}` replacement; `{name, plural, one{...} other{...}}` with only `one`/`other` keys and integer values; throws `InvalidArgumentException` on missing params | no dependencies; good default for apps |
| `Yiisoft\Translator\IntlMessageFormatter` | full ICU patterns via `ext-intl` (`MessageFormatter::format()`): `{count, plural, ...}`, `{gender, select, ...}`; returns the original message when there are no params or formatting fails | throws `RuntimeException` at construction when `ext-intl` is not loaded; requires ICU ≥ 49 |

To use a real formatter application-wide, alias the interface in `config/common/di/translation.php`
(documented in the package's `intl-formatter.md` / `simple-formatter.md` guides — the package does not bind it
itself):

```php
use Psr\SimpleCache\CacheInterface; // not needed here — example shows the alias only
use Yiisoft\Translator\IntlMessageFormatter;
use Yiisoft\Translator\MessageFormatterInterface;

return [
    MessageFormatterInterface::class => IntlMessageFormatter::class,
];
```

## 4. Message Storage Backends

Pick **exactly one primary reader** per deployment (see [Package Catalog](package-catalog.md) §16.3). All three read
per `{category}` × `{locale}`.

### 4.1. PHP Files (`translator-message-php`)

`Yiisoft\Translator\Message\Php\MessageSource` — implements **reader + writer**; constructor:
`__construct(private string $path)` (storage root). Layout: `{path}/{locale}/{category}.php`. No shipped
config — define the service yourself:

```php
MessageSource::class => [
    'class' => MessageSource::class,
    '__construct()' => ['path' => '@messages'], // e.g. project/messages directory
],
```

File format (as generated by `write()`, `file_put_contents(..., LOCK_EX)`, locale dir created with mode `0775`):

```php
<?php
/* Comment for message 1 (optional) */
return [
    'test.id1' => 'Nachricht 1',
    'test.id2' => 'Nachricht 2',
];
```

Best for small/medium apps: translations are version-controlled, opcache-friendly, and editable by the extractor
(§5).

### 4.2. Database (`translator-message-db`)

`Yiisoft\Translator\Message\Db\MessageSource` — reader + writer; constructor (from `src/MessageSource.php`):

```php
public function __construct(
    private ConnectionInterface $db,          // Yiisoft\Db\Connection\ConnectionInterface
    private ?CacheInterface $cache = null,    // optional PSR-16 cache of read results
    private string $sourceMessageTable = '{{%yii_source_message}}',
    private string $messageTable = '{{%yii_message}}',
    private int $cachingDuration = 3600,
)
```

- Reads join `source_message` × `message` (`indexBy('message_id')`); caching wraps reads in
  `CacheInterface::getOrSet()` keyed by `md5` of `[self::class, $category, $locale]`.
- `write()` inserts missing source messages and upserts translations.
- **Tables are not created automatically.** Use `Yiisoft\Log`-style schema manager:
  `Yiisoft\Translator\Message\Db\DbSchemaManager::ensureTables()` (constructor takes `ConnectionInterface`;
  also `ensureNoTables()`), or run the package's `sql/*-up.sql` files. DDL: `yii_source_message`
  (`id` PK auto-increment, `category varchar(255)`, `message_id text`, `comment text`), `yii_message`
  (`id` + `locale varchar(16)` composite PK, `translation text`, FK `id → yii_source_message.id` ON DELETE
  CASCADE, index on `locale`).

> [!WARNING]
> The package README's "with caching" example passes `$cacheDuration` as the **3rd positional argument** — the
> actual 3rd parameter is `$sourceMessageTable`. Use named arguments (`cache:`, `cachingDuration:`) when wiring;
> the source file is ground truth.

### 4.3. Gettext (`translator-message-gettext`)

`Yiisoft\Translator\Message\Gettext\MessageSource` — **read-only** (no writer); requires `ext-gettext`;
constructor `__construct(private string $path)` throws `RuntimeException` when the directory is missing.

- Catalog layout: `{path}/{locale}/LC_MESSAGES/{category}.mo` (compiled `.mo` files created with external tools,
  e.g. Poedit; `getMessages()` is unsupported — throws `RuntimeException`).
- Plural handling: when the first element of `$parameters` is an int, `dngettext($category, $id, $id, $n)` is used.
- Locale strings must match the OS convention: Windows `en-US.UTF-8`, Linux `en_US.UTF-8` (README warning).

## 5. Message Extraction (`translator-extractor`)

Console command (registered by the package's `config/di-console.php`):

```sh
./yii translator/extract [path]           # default path: getcwd()
# options: -L|--languages 'en' | -C|--category 'app' | -O|--only | -E|--except
```

It scans PHP sources for `->translate` calls (configurable via `Extractor::__construct(array $categories, string $translatorCall = '->translate')`),
merges found ids with existing messages in storage, and writes them through the category sources. Default
exclusion: `./vendor/**`.

> [!IMPORTANT]
> The shipped configuration defines `Extractor` with an **empty category list**, so the command fails with
> `NoCategorySourceConfigException` until the application overrides the `Extractor` DI definition with its own
> category source(s) — typically the same `MessageSource` used for translation, pointing at the messages
> directory:

```php
// config/console/di/extractor.php
use Yiisoft\Definitions\DynamicReference;
use Yiisoft\Translator\Extractor\Extractor;
use Yiisoft\Translator\Message\Php\MessageSource;
use Yiisoft\TranslatorExtractor\CategorySource as ExtractorCategorySource;

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

(The extractor's `CategorySource` is its own class — `Yiisoft\TranslatorExtractor\CategorySource`, constructor
`(string $name, MessageReaderInterface $reader, MessageWriterInterface $writer)` — distinct from
`Yiisoft\Translator\CategorySource`.)

## 6. Locale Handling

### 6.1. Locale Value Object (`yiisoft/i18n`)

- `Yiisoft\I18n\Locale` — immutable BCP 47 parser: `__construct(string $localeString)` throws
  `InvalidArgumentException` on invalid input; accessors + `with*()` for `language`, `script`, `region`,
  `variant`, `currency`, `calendar`, and more; `__toString()`.
  Key method: **`fallbackLocale(): self`** — progressively strips variant → region → script (`ru-RU-y Extended`
  → `ru-RU` → `ru`). The translator uses it for its fallback chain.
- `Yiisoft\I18n\LocaleProvider` — stateful holder for the current locale:
  `__construct(private Locale $defaultLocale)`, `get(): Locale`, `set(Locale $locale): void`,
  `isDefaultLocale(): bool`. Use it as the per-request locale source for services that need the locale without
  depending on the translator.

### 6.2. Locale Middleware (`yii-middleware`)

`Yiisoft\Yii\Middleware\Locale` (PSR-15) must be placed **before** the `Route` middleware. Constructor (from
`src/Locale.php`):

```php
public function __construct(
    private EventDispatcherInterface $eventDispatcher,
    private UrlGeneratorInterface $urlGenerator,
    private LoggerInterface $logger,
    private ResponseFactoryInterface $responseFactory,
    array $supportedLocales = [],                   // ['ru' => 'ru_RU', 'uz' => 'uz_UZ'] — map prefix → locale
    private array $ignoredRequestUrlPatterns = [],  // WildcardPattern patterns to skip
    private bool $secureCookie = false,
    private ?DateInterval $cookieDuration = null,   // null → never save the locale cookie
    private ?ClockInterface $clock = null,
)
```

Locale resolution priority: **URL path prefix** (`/de/blog`) → **query parameter** `_language` (customizable via
`withQueryParameterName()`) → **cookie** `_language` (only when `$cookieDuration !== null`; `withCookieName()`) →
**`Accept-Language` header** (only after `withDetectLocale(true)`). Unsupported formats throw
`InvalidLocalesFormatException`. Redirects (302) rewrite URLs to include the locale prefix; the default locale's
prefix is stripped for GET requests.

> [!IMPORTANT]
> The middleware does **not** call `TranslatorInterface::setLocale()` and does not touch `LocaleProvider`. It
> dispatches `Yiisoft\Yii\Middleware\Event\SetLocaleEvent` (with `getLocale(): string`). The application wires a
> listener to propagate the locale:

```php
// config/common/events.php
use Yiisoft\Translator\TranslatorInterface;
use Yiisoft\Yii\Middleware\Event\SetLocaleEvent;

return [
    SetLocaleEvent::class => [
        static function (SetLocaleEvent $event, TranslatorInterface $translator): void {
            $translator->setLocale($event->getLocale());
        },
    ],
];
```

Registration (no config ships with `yii-middleware`):

```php
// config/common/di/middleware.php — insert into the middleware stack before Route
use Yiisoft\Yii\Middleware\Locale;

return [
    Locale::class => [
        '__construct()' => [
            'supportedLocales' => ['en' => 'en-US', 'ru' => 'ru-RU'],
            'cookieDuration' => new \DateInterval('P30D'),
        ],
    ],
];
```

## 7. Missing Translation Events

When a message or category cannot be resolved, the translator dispatches (requires a configured
`EventDispatcherInterface`):

| Event | Getters | Meaning |
|---|---|---|
| `Yiisoft\Translator\Event\MissingTranslationEvent` | `getCategory()`, `getLanguage()`, `getMessage()` | the id was not found in any source for that locale |
| `Yiisoft\Translator\Event\MissingTranslationCategoryEvent` | `getCategory()` | no source registered for the category |

Typical use: a listener that logs gaps (inject `Psr\Log\LoggerInterface`, category `translation.missing` — see
[Logging Guide](logging.md)) so untranslated strings surface in monitoring.

## 8. Anti-Pattern Matrix

| Forbidden Anti-Pattern | Why it breaks | Idiomatic Yii3 Solution |
|---|---|---|
| Yii2-style `Yii::t('app', 'Hello')` | Static facade does not exist in Yii3 | Inject `TranslatorInterface`; call `->translate('hello', [...], 'app')` |
| Expecting `{placeholder}` substitution with default config | The default formatter is `NullMessageFormatter` — placeholders stay literal | Alias `MessageFormatterInterface::class` to `SimpleMessageFormatter` or `IntlMessageFormatter` (§3) |
| `composer require yiisoft/i18n-message-php` | No such package name — `composer.json` declares `yiisoft/translator-message-php` | Require the `translator-message-*` names (§1) |
| Inventing a `GettextMessageFormatter` class | Does not exist; gettext support is a message reader, not a formatter | Use the reader with any formatter (§4.3) |
| Positional constructor args for `translator-message-db` | README example misleads (3rd arg is `$sourceMessageTable`, not cache duration) | Use named arguments; verify against `src/MessageSource.php` (§4.2) |
| Writing translations via a gettext source | `MessageSource` is read-only — `write()` is impossible | Use the PHP or DB backend as writer; gettext for consumption only (§4.3) |
| Running `translator/extract` with shipped config | `Extractor` is wired with an empty category list → `NoCategorySourceConfigException` | Override the `Extractor` DI definition with your category source(s) (§5) |
| Assuming locale middleware configures the translator | It only dispatches `SetLocaleEvent` and sets the URL generator default | Add a `SetLocaleEvent` listener calling `$translator->setLocale()` (§6.2) |
| Registering `Locale` middleware after `Route` | Routing already happened; locale prefix in URLs is never parsed | Place `Locale` before `Route` in the middleware stack (§6.2) |
| Storing translator locale in static state / globals | No statics in Yii3; breaks worker-mode isolation | Use `TranslatorInterface::setLocale()` per request, driven by middleware events; `LocaleProvider` for other services |
| Hardcoding locale-dependent output in views | Splits translation logic across templates | Translate in the application layer or via the translator directly in templates with a single category scheme |
| Ignoring `MissingTranslationEvent` | Untranslated strings surface to users as raw ids | Log gaps via a listener (§7); set `fallbackLocale` sensibly (§2.2) |
