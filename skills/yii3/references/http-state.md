# Yii3 HTTP State Guide: Sessions, Cookies & CSRF

> [!IMPORTANT]
> **Grounding rule:** this guide is authoring synthesis for navigation and patterns. The source of truth for every class name, method signature, constructor argument, and configuration key is the installed package source under `vendor/yiisoft/<pkg>/src/`. Verify there before writing code; never substitute this guide for vendor sources, and never write Yii 2 APIs.

> Practical guide for server-side state with `yiisoft/session` (sessions, flash messages), client-side state with
> `yiisoft/cookies` (signing/encryption), and CSRF protection with `yiisoft/csrf`.

---

## Table of Contents
- [1. Package Map & Middleware Ordering](#1-package-map--middleware-ordering)
- [2. Sessions (`yiisoft/session`)](#2-sessions-yiisoftsession)
  - [2.1. Session API](#21-session-api)
  - [2.2. DI Wiring & Options](#22-di-wiring--options)
  - [2.3. SessionMiddleware](#23-sessionmiddleware)
  - [2.4. Custom Session Storage](#24-custom-session-storage)
  - [2.5. Manual Session Usage (Without Middleware)](#25-manual-session-usage-without-middleware)
- [3. Flash Messages](#3-flash-messages)
- [4. Cookies (`yiisoft/cookies`)](#4-cookies-yiisoftcookies)
  - [4.1. Cookie API](#41-cookie-api)
  - [4.2. CookieCollection](#42-cookiecollection)
  - [4.3. Signing & Encryption](#43-signing--encryption)
- [5. CSRF (`yiisoft/csrf`)](#5-csrf-yiisoftcsrf)
  - [5.1. Token Implementations](#51-token-implementations)
  - [5.2. Middleware Registration & DI Wiring](#52-middleware-registration--di-wiring)
  - [5.3. Forms & AJAX Usage](#53-forms--ajax-usage)
- [6. Worker Mode Notes](#6-worker-mode-notes)
- [7. Anti-Pattern Matrix](#7-anti-pattern-matrix)
- [8. Related Topic Guides](#8-related-topic-guides)

---

## 1. Package Map & Middleware Ordering

| Package | Role |
|---|---|
| `yiisoft/session` | `Session` (PSR-style session wrapper), `Flash` messages, `SessionMiddleware` (PSR-15). Since 3.0.3 it does **not** depend on `yiisoft/cookies`. |
| `yiisoft/cookies` | `Cookie` value object, `CookieCollection`, `CookieSigner` / `CookieEncryptor`, `CookieMiddleware`. |
| `yiisoft/csrf` | `CsrfTokenInterface` + implementations (`Synchronizer`, `Hmac`, `Masked`), three PSR-15 middleware. |

Verified middleware order (from both packages' READMEs):

```
ErrorCatcher → SessionMiddleware → CsrfTokenMiddleware (or CsrfHeaderMiddleware) → Router
```

CSRF needs the session (synchronizer token) or an identity source (HMAC) — hence the order.

> [!NOTE]
> Helper classes used in this guide live in packages that are **already direct dependencies** — no extra install
> is needed: `Yiisoft\Http\Method` (`yiisoft/http`, required by `yiisoft/csrf`), `Yiisoft\Security\Mac` / `Crypt` /
> `TokenMask` (`yiisoft/security`, required by both `yiisoft/csrf` and `yiisoft/cookies`), and
> `Yiisoft\Strings\WildcardPattern` (`yiisoft/strings`, required by both as well). The one exception is
> `Psr\Clock\ClockInterface` (the optional `$clock` argument of `Cookie`, §4.1): it is only a dev dependency of
> `yiisoft/cookies`, so an application that passes a custom clock must `composer require psr/clock` itself;
> passing `null` (the default) uses real time.

## 2. Sessions (`yiisoft/session`)

### 2.1. Session API

`Yiisoft\Session\Session` is `final` and implements **only `SessionInterface`** (no `ArrayAccess`, no
`Countable`). There is **no `SessionConfiguration` class** — options are a plain PHP session options array:

```php
public function __construct(array $options = [], ?SessionHandlerInterface $handler = null)
```

Defaults (merged under `$options`, from `src/Session.php`): `cookie_secure: 1`, `use_only_cookies: 1`,
`cookie_httponly: 1`, `use_strict_mode: 1`, `cookie_samesite: 'Lax'`. The constructor forces `use_cookies = 0`
(the `SessionMiddleware` sends the cookie itself) and removes `cache_limiter`.

> [!NOTE]
> Upgrade trap (3.0): the options `sid_length` and `sid_bits_per_character` were dropped from the package defaults
> (they are deprecated in PHP 8.4). If you relied on their previous defaults, set them explicitly in `options`.

Complete public API (from `src/SessionInterface.php`):

| Method | Notes |
|---|---|
| `get(string $key, $default = null)`, `set(string $key, $value): void` | value access |
| `has(string $key): bool`, `remove(string $key): void` | existence |
| `pull(string $key, $default = null)` | get + remove in one call |
| `all(): array`, `clear(): void` | whole store (`clear()` removes data from runtime only and is a no-op without a session id) |
| `destroy(): void` | `session_destroy()` + id reset — removes data from runtime **and** storage; acts only while the session is active |
| `open(): void` / `close(): void` / `discard(): void` | start / `session_write_close` / `session_abort`; `open()`, `close()` and `regenerateId()` throw `Yiisoft\Session\SessionException` (final, extends `RuntimeException`) |
| `isActive(): bool`, `getId(): ?string`, `setId(string): void`, `regenerateId(): void` | id management (`regenerateId()` keeps all data and opens the session first if inactive; on when to call it, see §2.5) |
| `getName(): string`, `getCookieParameters(): array` | cookie metadata for the session id |

`Yiisoft\Session\NullSession` is a `final` no-op `SessionInterface` implementation (`get()`/`pull()` return `null`,
`isActive()` is `false`, `all()` is `[]`, `getName()` returns `'null'`) — useful in tests and in stateless API
contexts.

### 2.2. DI Wiring & Options

The package ships `config/di-web.php` + `config/params.php`. **Inject `SessionInterface`**, never the concrete
class:

```php
// shipped config/di-web.php (verbatim structure)
SessionInterface::class => [
    'class' => Session::class,
    '__construct()' => [
        $params['yiisoft/session']['session']['options'],
        $params['yiisoft/session']['session']['handler'],
    ],
    'reset' => function () { $this->sessionId = null; $this->close(); },
],
FlashInterface::class => Flash::class,
```

```php
// shipped config/params.php — override in config/common/params.php
'yiisoft/session' => [
    'session' => [
        // Two layers of defaults: the class itself defaults to cookie_secure = 1, and the shipped
        // params deliberately pre-override it to 0 because SessionMiddleware throws SessionException
        // when cookie_secure is on and the request scheme is not HTTPS. Set 1 for HTTPS in production.
        'options' => ['cookie_secure' => 0],
        'handler' => null, // SessionHandlerInterface for custom storage (§2.4)
    ],
],
```

User `options` are merged **over** the class defaults, so an override may list only the keys it changes.

```php
// application code
use Yiisoft\Session\SessionInterface;

public function __construct(private SessionInterface $session) {}
```

### 2.3. SessionMiddleware

`Yiisoft\Session\SessionMiddleware` (PSR-15, constructor takes `SessionInterface`) drives the per-request session
lifecycle in the HTTP pipeline: it restores the session id from the request cookie, commits the session on egress
(discarding uncommitted changes when downstream throws), and emits the session cookie only when the id changed.

> [!TIP]
> **SessionMiddleware Behavior Reference:**
> For the complete behavioral contract — conditional `setId()`, discard-on-`Throwable`, the `SessionException` thrown
> when `cookie_secure` is enabled without HTTPS, and route-group placement for token-authenticated APIs — see the
> [PSR-15 Middlewares Guide, §3.1](http-middlewares.md#31-sessionmiddleware-behavior).

State-owned notes: the `Set-Cookie` attributes come from `Session::getCookieParameters()` (§2.1); keep the `reset`
closure of the shipped DI definition — it matters for long-running workers (§6); outside the HTTP pipeline the
session lifecycle is managed manually (§2.5).

### 2.4. Custom Session Storage

Pass any class implementing `\SessionHandlerInterface` (PHP's standard custom-storage contract) as the second
constructor argument — `new Session($options, $handler)`; the constructor registers it via
`session_set_save_handler($handler, true)`. In an application, wire the handler through the `'handler'` params
key consumed by the shipped DI definition (§2.2):

```php
<?php

declare(strict_types=1);

use App\Session\MyDbSessionHandler;
use Yiisoft\Definitions\Reference;

return [
    'yiisoft/session' => [
        'session' => [
            'options' => ['cookie_secure' => 1], // merged over the class defaults — list only changed keys
            'handler' => Reference::to(MyDbSessionHandler::class),
        ],
    ],
];
```

> [!NOTE]
> No concrete storage handler ships with `yiisoft/session` — implement `\SessionHandlerInterface` against your own
> backend (Redis, a database, ...). For Redis in production, this `'handler'` params key is the wiring point.

### 2.5. Manual Session Usage (Without Middleware)

Outside the HTTP pipeline (console commands, workers, queue handlers) the session lifecycle is managed manually —
this is official usage, not a workaround:

```php
<?php

declare(strict_types=1);

use Yiisoft\Session\SessionInterface;

final readonly class ImportRunner
{
    public function __construct(private SessionInterface $session) {}

    public function run(): void
    {
        $this->session->open();
        try {
            // ... long-running work; read/write with get()/set()/pull() ...
            $this->session->set('lastImportAt', time());
        } finally {
            // Close as early as possible: while the session is open it blocks
            // other requests that use the same session.
            $this->session->close();
        }
    }
}
```

- `open()` starts the session, `close()` commits and releases it (`session_write_close`), `discard()` drops all
  changes of the current request (`session_abort`).
- `open()`, `close()` and `regenerateId()` throw `Yiisoft\Session\SessionException` — handle it or let it bubble.
- `regenerateId()` keeps all session data and opens the session first if it is inactive.
- General security practice (OWASP-style guidance, **not** package documentation): call `regenerateId()` after a
  login or any privilege escalation to mitigate session fixation.

## 3. Flash Messages

Flash data lives one-request-forward in the session. `Yiisoft\Session\Flash\Flash` (implements
`FlashInterface`; DI-bound as `FlashInterface::class => Flash::class` by the package):

```php
public function __construct(private SessionInterface $session) {}

public function get(string $key);                       // null if absent; an array of messages when add() was used
public function getAll(): array;
public function set(string $key, $value = true, bool $removeAfterAccess = true): void;
public function add(string $key, $value = true, bool $removeAfterAccess = true): void; // appends to array
public function remove(string $key): void;
public function removeAll(): void;
public function has(string $key): bool;
```

- `$removeAfterAccess: true` (default): the entry remains until it was accessed once, then is deleted after the
  next request; `false`: deleted after the next request regardless of access.
- Inject `FlashInterface` into actions; after a redirect, the target action reads
  `$flash->get('success_message')`.
- Flash data lives in the session under the `__flash` key (with a `__counters` sub-key) — never write these keys
  manually.

## 4. Cookies (`yiisoft/cookies`)

### 4.1. Cookie API

`Yiisoft\Cookies\Cookie` is a `final` immutable value object (no interface, **no** `RequestCookies` /
`ResponseCookies` classes exist):

```php
public function __construct(
    string $name,
    string $value = '',
    ?DateTimeInterface $expires = null,
    ?string $domain = null,
    ?string $path = '/',
    ?bool $secure = true,
    ?bool $httpOnly = true,
    ?string $sameSite = self::SAME_SITE_LAX,   // 'Lax' | 'Strict' | 'None'
    bool $encodeValue = true,
    ?ClockInterface $clock = null,
)
```

Fluent `with*()` methods: `withValue()`, `withRawValue()` (no URL-encoding), `withExpires()`,
`withMaxAge(DateInterval)`, `expire()` (immediately), `expireWhenBrowserIsClosed()`, `withDomain()`,
`withPath()`, `withSecure()`, `withHttpOnly()`, `withSameSite()`. Forcing `SameSite=None` implicitly sets
`secure = true`.

```php
$cookie = (new Cookie('theme', 'dark', path: '/'))
    ->withMaxAge(new DateInterval('P30D'))
    ->withHttpOnly(false); // only for values JS must read

// send to the client:
$response = $cookie->addToResponse($response);            // appends a Set-Cookie header

// read from the request:
$cookies = CookieCollection::fromArray($request->getCookieParams());
$theme = $cookies->getValue('theme', 'light');
```

### 4.2. CookieCollection

`Yiisoft\Cookies\CookieCollection` (`final`, implements `IteratorAggregate`, `ArrayAccess`, `Countable` —
`foreach`, `count()`, `$collection[$name]`, `isset()`, `unset()` all work; `toArray()` is also available):

- Read helpers: `get(name): ?Cookie`, `getValue(name, ?default): ?string`, `has(name): bool`, `getKeys(): array`,
  `getValues(): Cookie[]`, `isEmpty(): bool`, `contains(Cookie): bool`, `exists(callable): bool`.
  Three similar-looking checks with different semantics:
  - `has(name)` — is a cookie with this **name** present?
  - `contains(Cookie)` — is this exact Cookie **instance** in the collection (object identity)?
  - `exists(callable)` — does any cookie satisfy a **predicate**, which receives `(Cookie $cookie, string $name)`?
- Mutation: `add(Cookie)` (replaces a same-name cookie), `remove(name): ?Cookie`, `expire(name)` (replaces it with
  an expired copy), `clear()`, `walk(callable)` (the first callback parameter is passed by reference).
- Construction: `fromArray(array $nameValuePairs)` and `fromResponse(ResponseInterface)` (parses every
  `Set-Cookie`). Note: `fromArray()` builds cookies with **default** attributes (Path=/, Secure, HttpOnly,
  SameSite=Lax).
- Response writing: `addToResponse($response)` appends all cookies; `setToResponse($response)` replaces
  existing `Set-Cookie` headers first.

```php
<?php

declare(strict_types=1);

use Psr\Http\Message\ResponseFactoryInterface;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Server\RequestHandlerInterface;
use Yiisoft\Cookies\Cookie;
use Yiisoft\Cookies\CookieCollection;

final readonly class ThemeHandler implements RequestHandlerInterface
{
    public function __construct(private ResponseFactoryInterface $responseFactory) {}

    public function handle(ServerRequestInterface $request): ResponseInterface
    {
        $cookies = CookieCollection::fromArray($request->getCookieParams());

        $theme = $cookies->getValue('theme', 'light');   // read with fallback
        $present = $cookies->has('theme');               // by name
        $exact = $cookies->contains(new Cookie('theme', $theme)); // by object identity
        $matched = $cookies->exists(                     // by predicate
            static fn (Cookie $cookie, string $name): bool => $name === 'theme',
        );

        return $this->responseFactory->createResponse();
    }
}
```

### 4.3. Signing & Encryption

Client-visible-but-tamper-proof cookies — sign or encrypt with a secret key (key from project config, e.g.
`params`):

| Class | Constructor | Methods | Mechanism |
|---|---|---|---|
| `Yiisoft\Cookies\CookieSigner` | `__construct(string $key)` | `sign(Cookie)`, `validate(Cookie)`, `isSigned(Cookie)` | `Yiisoft\Security\Mac`; signed value = `md5(CookieSigner::class . cookieName)` prefix (32 hex chars) + HMAC-SHA256 hex signature (64 chars) + the same md5 prefix + the original value — 128 chars of overhead before the clean value |
| `Yiisoft\Cookies\CookieEncryptor` | `__construct(string $key)` | `encrypt(Cookie)`, `decrypt(Cookie)`, `isEncrypted(Cookie)` | `Yiisoft\Security\Crypt` (`encryptByKey`/`decryptByKey`, with the cookie **name as the `$info` argument**); payload stored as prefix + URL-encoded ciphertext |

`sign()`/`validate()` (signer) and `encrypt()`/`decrypt()` (encryptor) throw `RuntimeException` when the cookie is
already signed/encrypted, not validly signed/encrypted, or tampered. Signer and encryptor use **different**
prefixes (`md5(<their own class> . cookieName)`), so `isSigned()` / `isEncrypted()` are safe pre-checks before
calling `validate()` / `decrypt()`.

`Yiisoft\Cookies\CookieMiddleware` (PSR-15) automates both directions: constructor
`__construct(LoggerInterface $logger, CookieEncryptor $encryptor, CookieSigner $signer, array $cookiesSettings = [])`
— `$cookiesSettings` maps cookie-name wildcard patterns (`Yiisoft\Strings\WildcardPattern`) to `ENCRYPT` or
`SIGN`. It decrypts/validates request cookies (tampered cookies are dropped and logged at info level) and
encrypts/signs outgoing `Set-Cookie` headers.

## 5. CSRF (`yiisoft/csrf`)

### 5.1. Token Implementations

```php
interface CsrfTokenInterface
{
    public function getValue(): string;
    public function validate(string $token): bool;
}
```

There is **no `CsrfToken` concrete class**. Implementations:

| Class | Constructor | Notes |
|---|---|---|
| `Yiisoft\Csrf\MaskedCsrfToken` | `(CsrfTokenInterface $token)` | Decorator that masks the token (`Yiisoft\Security\TokenMask`) — **BREACH protection; the shipped default wrapper**. `getValue()` re-masks on every call (fresh random mask) — never compare a rendered token with a submitted one manually |
| `Yiisoft\Csrf\Synchronizer\SynchronizerCsrfToken` | `(CsrfTokenGeneratorInterface $generator, CsrfTokenStorageInterface $storage)` | classic per-session token; generates + stores on first access; validates with `hash_equals` |
| `Yiisoft\Csrf\Hmac\HmacCsrfToken` | `(CsrfTokenIdentityGeneratorInterface $identityGenerator, string $secretKey, string $algorithm = 'sha256', ?int $lifetime = null)` | stateless signed token (no token storage); `$lifetime` = validity in seconds, `null` = never expires. By default the identity scope is still the **session** — the shipped identity generator is `SessionCsrfTokenIdentityGenerator` (identity = session id); provide a custom `CsrfTokenIdentityGeneratorInterface` for fully stateless setups |
| `Yiisoft\Csrf\StubCsrfToken` | `(?string $token = null)` | plain equality — testing only |

Shipped companions: `RandomCsrfTokenGenerator(int $length = 32)`, `SessionCsrfTokenStorage(SessionInterface, string $key = '_csrf')`
(implements `CsrfTokenStorageInterface`: `get()`, `set()`, `remove()`), and
`SessionCsrfTokenIdentityGenerator(SessionInterface)` (identity = session id).

### 5.2. Middleware Registration & DI Wiring

The three PSR-15 CSRF middlewares (`CsrfTokenMiddleware`, `CsrfHeaderMiddleware`, `CsrfTokenCookieMiddleware`) — their
constructors, configuration (including the `withSafeMethods()` replacement trap), failure handling, and pipeline
ordering — are cataloged in the [PSR-15 Middlewares Guide, §3.2](http-middlewares.md#32-csrf-middleware-behavior).
This section owns only the state-side wiring.

Shipped DI (`config/di-web.php`): `CsrfTokenInterface::class` → `MaskedCsrfToken` wrapping
`SynchronizerCsrfToken` (generator `RandomCsrfTokenGenerator`, storage `SessionCsrfTokenStorage`); the
`HmacCsrfToken` wiring reads the only params key:

```php
'yiisoft/csrf' => [
    'hmacToken' => ['secretKey' => '', 'algorithm' => 'sha256', 'lifetime' => null],
],
```

> [!NOTE]
> The shipped `config/di-web.php` defines **no middleware** — the CSRF middlewares must be registered in the
> middleware stack yourself (ordering: §1). There are also **no** `headerName`/`parameterName`/`csrfToken` DI param
> keys — middleware names and safe methods are configured with the immutable `with*()` methods in the DI definition,
> e.g. `CsrfTokenMiddleware::class => ['withHeaderName()' => ['X-CSRF-PROTECTION']]`
> (configuration patterns in the [PSR-15 Middlewares Guide, §3.2](http-middlewares.md#32-csrf-middleware-behavior)).

### 5.3. Forms & AJAX Usage

Inject `CsrfTokenInterface` (the DI default already includes masking) into the action that renders a form and pass the
value to the template. Form-side CSRF injection — opening the form with the token and rendering the hidden field — is
owned by the [Views & Widgets Guide](http-views-and-widgets.md):
[§5.5](http-views-and-widgets.md#55-csrf-token-object-csrf--injected-security) for the injected `Csrf` view object and
[§8](http-views-and-widgets.md#8-html-form-rendering-yiisofthtml-yiisoftform-model-yiisoftform) for HTML form
rendering. Two state-side facts to keep in sync:

- The hidden field name must match the middleware configuration — use the `CsrfTokenMiddleware::PARAMETER_NAME`
  constant or read `$middleware->getParameterName()` instead of hard-coding `_csrf`.
- There is no built-in integration with `yiisoft/form-model` / `yiisoft/form` — the token is rendered manually in
  templates, not through form-model attributes.

For AJAX: send the token via the `X-CSRF-Token` header, or use one of the two official client flows:

- **Token endpoint:** an **OPTIONS** route — `Route::options('/csrf-token')` — responding with the token in the
  body and an `X-CSRF-TOKEN` header (it is not a GET endpoint).
- **Cookie flow:** `CsrfTokenCookieMiddleware` publishes `XSRF-TOKEN`; the client sends it back as
  `X-XSRF-TOKEN`, matched with `->withHeaderName('X-XSRF-TOKEN')`. Official wiring order:
  `ErrorCatcher → SessionMiddleware → CsrfTokenCookieMiddleware → CsrfTokenMiddleware (withHeaderName('X-XSRF-TOKEN')) → Router`.

> [!IMPORTANT]
> `CsrfTokenMiddleware` reads the token from **parsed body** — for JSON payloads the body must be parsed by
> `Yiisoft\Request\Body\RequestBodyParser` first, or the token must arrive via the header instead
> (see [PSR-15 Middlewares Guide](http-middlewares.md)). Its default parsers cover **only** `application/json`
> (XML or form-data parsers require `withParser()`); malformed JSON is answered with `400` by the default
> `BadRequestHandler`, and JSON objects are decoded as associative arrays.

## 6. Worker Mode Notes

Under long-running runners (RoadRunner, FrankenPHP — see [Package Catalog](package-catalog.md) §5.9, High-Performance Workers):

- Do **not** store per-request state in PHP superglobals or singleton properties; the `Session` object is a
  stateful wrapper around PHP session functions — it holds the current session id internally, so middleware-driven
  open/close per request keeps it correct. Session-id reuse in long-running workers was fixed in **3.0.3**.
  For code outside the HTTP pipeline, manage the lifecycle manually (§2.5).
- The shipped `Session` DI definition includes a `reset` closure (closes the session and clears the id) — keep it
  when overriding the definition.
- `CsrfTokenMiddleware`'s synchronizer token lives in the session: stateful CSRF requires sessions to work in
  worker mode too. The HMAC token needs no token storage, but its shipped identity generator is still
  session-backed (`SessionCsrfTokenIdentityGenerator`) — swap in a custom `CsrfTokenIdentityGeneratorInterface`
  for truly stateless setups (§5.1).

## 7. Anti-Pattern Matrix

| Forbidden Anti-Pattern | Why it breaks | Idiomatic Yii3 Solution |
|---|---|---|
| Yii2-style `Yii::$app->session` / `Yii::$app->response->cookies` | No service locator in Yii3 | Inject `SessionInterface` / use `Cookie` + response (§2.1, §4.1) |
| Calling non-existent `$session->getFlash()`, `$session->setFlash()`, or `$session->flash()` | `SessionInterface` has no flash methods in Yii3 | Inject `FlashInterface` (`Yiisoft\Session\Flash\Flash`) (§3) |
| Type-hinting `Yiisoft\Session\Session` (concrete) | Blocks `NullSession` in tests and stateless contexts | Hint `SessionInterface` (§2.2) |
| Inventing `SessionConfiguration` / `RequestCookies` / `ResponseCookies` / `CsrfToken` classes | None of them exist in the current packages | Use the options array, `CookieCollection`, and `CsrfTokenInterface` (§2, §4, §5.1) |
| Writing cookies by manually building `Set-Cookie` strings | Easy to break encoding/attributes | Use `Cookie::addToResponse()` / `CookieCollection::setToResponse()` (§4) |
| Storing secrets in unsigned cookies | Client can read and tamper | Sign with `CookieSigner` or encrypt with `CookieEncryptor`; validate on read (§4.3) |
| CSRF middleware without session storage | Synchronizer token has nowhere to persist → new token per request, forms always fail | Register `SessionMiddleware` **before** CSRF, or switch to `HmacCsrfToken` (§1, §5.1) |
| Using deprecated `CsrfMiddleware` | Marked `@deprecated` in favor of `CsrfTokenMiddleware` | Use `CsrfTokenMiddleware` ([Middlewares Guide §3.2](http-middlewares.md#32-csrf-middleware-behavior)) |
| Copying `'withSafeMethods()' => [[Method::OPTIONS]]` from SPA recipes into a server-rendered app | `withSafeMethods()` **replaces** the whole default list — GET and HEAD become CSRF-checked and forms start failing with 422 | Keep the default safe methods `[GET, HEAD, OPTIONS]` for server-rendered forms; the OPTIONS-only definition is for any-origin JavaScript SPAs ([Middlewares Guide §3.2](http-middlewares.md#32-csrf-middleware-behavior)) |
| Expecting `_csrf` in JSON body without `RequestBodyParser` | Parsed body is `null`; token never found → 422 | Parse JSON bodies upstream or send `X-CSRF-Token` header (§5.3) |
| Regenerating the session id only at login setup, never after privilege change | Session fixation remains possible | Call `$session->regenerateId()` after every privilege escalation (general security practice — OWASP-style guidance, not prescribed by the packages) (§2.5) |
| Keeping `cookie_secure: 0` in production | Session cookie travels over HTTP | Set `'cookie_secure' => 1` for HTTPS deployments (the middleware enforces scheme consistency) (§2.2; [Middlewares Guide §3.1](http-middlewares.md#31-sessionmiddleware-behavior)) |
| Rendering CSRF hidden inputs with a wrong parameter name after renaming the middleware | Token mismatch → every POST is 422 | Keep name and middleware config in sync — read the name via `CsrfTokenMiddleware::PARAMETER_NAME` / `$middleware->getParameterName()` and the value via `$csrfToken->getValue()` (`_csrf` default) (§5.3) |

---

## 8. Related Topic Guides

- [Actions & Controllers Guide](http-actions-and-controllers.md) — Cookie attachments, session reads, and flash messages inside Presentation Actions.
- [PSR-15 Middlewares Guide](http-middlewares.md) — Behavioral catalog for SessionMiddleware and the CSRF middlewares, and pipeline ordering.
- [Authentication & RBAC Guide](infra-auth-and-rbac.md) — User login/logout session state lifecycle and remember-me cookies.
- [Views & Widgets Guide](http-views-and-widgets.md) — Form-side CSRF token injection (§5.5) and HTML form rendering (§8).
- [Validation & Forms Guide](http-validation-and-forms.md) — Form models, validation rules, and hydration (backend slice; form rendering is owned by the Views & Widgets Guide).
