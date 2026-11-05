# Yii3 i18n: Translation API & Formatters

> [!IMPORTANT]
> **Grounding rule:** sources of truth are split by question type — API: installed `vendor/yiisoft/<pkg>/src/` (versions via `composer.lock`); implementation patterns: this guide; project conventions: the project's architecture artifact or dominant `src/` style. Full table and conflict rule: SKILL.md Core rule 2.

> Part of the [Internationalization & Translation Guide](http-i18n-translation.md) split — the anti-pattern matrix and related guides live there.

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
