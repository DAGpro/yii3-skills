# Yii3 Internationalization & Translation Guide

> [!IMPORTANT]
> **Grounding rule:** sources of truth are split by question type — API: installed `vendor/yiisoft/<pkg>/src/` (versions via `composer.lock`); implementation patterns: this guide; project conventions: the project's architecture artifact or dominant `src/` style. Full table and conflict rule: SKILL.md Core rule 2.

> Practical guide for message translation with `yiisoft/translator`, locale handling with `yiisoft/i18n`,
> storage backends (`translator-message-php/db/gettext`), message extraction with `translator-extractor`,
> locale routing with `Locale middleware`, plus the supporting packages the DB backend needs
> (`yiisoft/db`, `yiisoft/cache`, `yiisoft/db-migration`) and the i18n boundaries of view/mailer/error-handler.

This topic is split into two focused guides — load the one that matches the task:

- [Translation API & Formatters](http-i18n-translation-api.md) — package map & installation, `TranslatorInterface` API, categories, `FormatterInterface` date/number formatters (§1–§3).
- [Message Storage, Extraction & Locale Handling](http-i18n-storage-and-locale.md) — PHP/DB/gettext storage backends, message extraction, `Locale` middleware & locale routing, missing-translation events, ecosystem boundaries, testing (§4–§9).

Read this file for the anti-pattern matrix (§10) and related guides (§11).

---
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

---

## 11. Related Topic Guides

- [Actions & Controllers Guide](http-actions-and-controllers.md) — Injecting TranslatorInterface into Presentation Actions for flash and error messages.
- [Validation & Forms Guide](http-validation-and-forms.md) — Translating validation rule messages and attribute labels.
- [Views, Layouts & Widgets Guide](http-views-and-widgets.md) — Localization inside templates and view injections.
- [Events & Listeners Guide](core-events-and-listeners.md) — Handling SetLocaleEvent and MissingTranslationEvent.
- [Database Migrations Guide](persistence-migrations.md) — Creating the translator message-source schema with a revertible migration (§4.2).