# Yii3 HTTP State Guide: Sessions, Cookies & CSRF

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
- [3. Flash Messages](#3-flash-messages)
- [4. Cookies (`yiisoft/cookies`)](#4-cookies-yiisoftcookies)
  - [4.1. Cookie API](#41-cookie-api)
  - [4.2. CookieCollection](#42-cookiecollection)
  - [4.3. Signing & Encryption](#43-signing--encryption)
- [5. CSRF (`yiisoft/csrf`)](#5-csrf-yiisoftcsrf)
  - [5.1. Token Implementations](#51-token-implementations)
  - [5.2. Middleware Catalog](#52-middleware-catalog)
  - [5.3. Forms & AJAX Usage](#53-forms--ajax-usage)
- [6. Worker Mode Notes](#6-worker-mode-notes)
- [7. Anti-Pattern Matrix](#7-anti-pattern-matrix)

---

## 1. Package Map & Middleware Ordering

| Package | Role |
|---|---|
| `yiisoft/session` | `Session` (PSR-style session wrapper), `Flash` messages, `SessionMiddleware` (PSR-15). Since 3.0 it does **not** depend on `yiisoft/cookies`. |
| `yiisoft/cookies` | `Cookie` value object, `CookieCollection`, `CookieSigner` / `CookieEncryptor`, `CookieMiddleware`. |
| `yiisoft/csrf` | `CsrfTokenInterface` + implementations (`Synchronizer`, `Hmac`, `Masked`), three PSR-15 middleware. |

Verified middleware order (from both packages' READMEs):

```
ErrorCatcher → SessionMiddleware → CsrfTokenMiddleware (or CsrfHeaderMiddleware) → Router
```

CSRF needs the session (synchronizer token) or an identity source (HMAC) — hence the order.

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

Complete public API (from `src/SessionInterface.php`):

| Method | Notes |
|---|---|
| `get(string $key, $default = null)`, `set(string $key, $value): void` | value access |
| `has(string $key): bool`, `remove(string $key): void` | existence |
| `pull(string $key, $default = null)` | get + remove in one call |
| `all(): array`, `clear(): void` | whole store (`clear()` wipes `$_SESSION` at runtime) |
| `destroy(): void` | `session_destroy()` + id reset |
| `open(): void` / `close(): void` / `discard(): void` | start / `session_write_close` / `session_abort`; `open()` throws `Yiisoft\Session\SessionException` |
| `isActive(): bool`, `getId(): ?string`, `setId(string): void`, `regenerateId(): void` | id management (call `regenerateId()` after login — session fixation) |
| `getName(): string`, `getCookieParameters(): array` | cookie metadata for the session id |

`Yiisoft\Session\NullSession` is a no-op `SessionInterface` implementation — useful in tests and in stateless API
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
        'options' => ['cookie_secure' => 0], // set 1 behind HTTPS in production
        'handler' => null,                   // SessionHandlerInterface for custom storage
    ],
],
```

```php
// application code
use Yiisoft\Session\SessionInterface;

public function __construct(private SessionInterface $session) {}
```

### 2.3. SessionMiddleware

`Yiisoft\Session\SessionMiddleware` (PSR-15, constructor takes `SessionInterface`):

- Before handling: reads the session id from the request cookie named by `$session->getName()` and calls
  `setId()`.
- After handling: on any `Throwable` it **discards** the session (uncommitted changes are lost); otherwise
  `close()`s an active session and appends a `Set-Cookie` header **only when the session id changed** (cookie
  attributes come from `getCookieParameters()`).
- Throws `SessionException` when `cookie_secure` is enabled but the request scheme is not HTTPS; adds the
  `Secure` flag automatically for `SameSite=None`.

### 2.4. Custom Session Storage

Pass any `\SessionHandlerInterface` implementation (Redis, DB, ...) as the second constructor argument —
`new Session($options, $handler)`; it is registered via `session_set_save_handler($handler, true)`. For Redis
storage in production, wire the handler in DI and set it through the `'handler'` param key.

## 3. Flash Messages

Flash data lives one-request-forward in the session. `Yiisoft\Session\Flash\Flash` (implements
`FlashInterface`; DI-bound as `FlashInterface::class => Flash::class` by the package):

```php
public function __construct(private SessionInterface $session) {}

public function get(string $key);                       // null if absent
public function getAll(): array;
public function set(string $key, $value = true, bool $removeAfterAccess = true): void;
public function add(string $key, $value = true, bool $removeAfterAccess = true): void; // appends to array
public function remove(string $key): void;
public function removeAll(): void;
public function has(string $key): bool;
```

- `$removeAfterAccess: true` (default) deletes the entry after it was read once; `false` deletes it after the
  next request regardless.
- Inject `FlashInterface` into actions; after a redirect, the target action reads
  `$flash->get('success_message')`.

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

`Yiisoft\Cookies\CookieCollection` (implements `IteratorAggregate`, `ArrayAccess`, `Countable`):

- Read helpers: `get(name): ?Cookie`, `getValue(name, ?default): ?string`, `has()`, `getKeys()`,
  `getValues(): Cookie[]`, `isEmpty()`, `contains()`, `exists(callable)`.
- Mutation: `add(Cookie)`, `remove(name): ?Cookie`, `expire(name)`, `clear()`, `walk(callable)`.
- Construction: `fromArray(array $nameValuePairs)` and `fromResponse(ResponseInterface)` (parses `Set-Cookie`).
- Response writing: `addToResponse($response)` appends all cookies; `setToResponse($response)` replaces
  existing `Set-Cookie` headers first.

### 4.3. Signing & Encryption

Client-visible-but-tamper-proof cookies — sign or encrypt with a secret key (key from project config, e.g.
`params`):

| Class | Constructor | Methods | Mechanism |
|---|---|---|---|
| `Yiisoft\Cookies\CookieSigner` | `__construct(string $key)` | `sign(Cookie)`, `validate(Cookie)`, `isSigned(Cookie)` | `Yiisoft\Security\Mac`; signature inline (first 32 chars) after an `md5(package+name)` prefix |
| `Yiisoft\Cookies\CookieEncryptor` | `__construct(string $key)` | `encrypt(Cookie)`, `decrypt(Cookie)`, `isEncrypted(Cookie)` | `Yiisoft\Security\Crypt` (`encryptByKey`/`decryptByKey`); payload URL-encoded |

`sign()`/`validate()` throw `RuntimeException` when the cookie is already signed / tampered / unsigned.

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
| `Yiisoft\Csrf\MaskedCsrfToken` | `(CsrfTokenInterface $token)` | Decorator that masks the token (`Yiisoft\Security\TokenMask`) — **BREACH protection; the shipped default wrapper** |
| `Yiisoft\Csrf\Synchronizer\SynchronizerCsrfToken` | `(CsrfTokenGeneratorInterface $generator, CsrfTokenStorageInterface $storage)` | classic per-session token; generates + stores on first access; validates with `hash_equals` |
| `Yiisoft\Csrf\Hmac\HmacCsrfToken` | `(CsrfTokenIdentityGeneratorInterface $identityGenerator, string $secretKey, string $algorithm = 'sha256', ?int $lifetime = null)` | stateless signed token; `$lifetime` adds expiry |
| `Yiisoft\Csrf\StubCsrfToken` | `(?string $token = null)` | plain equality — testing only |

Shipped companions: `RandomCsrfTokenGenerator(int $length = 32)`, `SessionCsrfTokenStorage(SessionInterface, string $key = '_csrf')`
(implements `CsrfTokenStorageInterface`: `get()`, `set()`, `remove()`), and
`SessionCsrfTokenIdentityGenerator(SessionInterface)` (identity = session id).

### 5.2. Middleware Catalog

All three are PSR-15 middleware in `Yiisoft\Csrf\`:

| Middleware | Purpose |
|---|---|
| `CsrfTokenMiddleware` | The standard one. Constants: `PARAMETER_NAME = '_csrf'`, `HEADER_NAME = 'X-CSRF-Token'`. Constructor: `(ResponseFactoryInterface $responseFactory, CsrfTokenInterface $token, ?RequestHandlerInterface $failureHandler = null)`. Immutable config: `withParameterName()`, `withHeaderName()`, `withSafeMethods()` (default `[GET, HEAD, OPTIONS]`). Token is read from the parsed body parameter `_csrf`, falling back to the `X-CSRF-Token` header. On failure: the `$failureHandler` if configured, otherwise `422` with a plain-text body. (`CsrfMiddleware` — without "Token" — is **deprecated**, use `CsrfTokenMiddleware`.) |
| `CsrfHeaderMiddleware` | AJAX/SPA variant: requires the presence of a custom header (`HEADER_NAME = 'X-CSRF-Header'`); no token value matching. Unsafe methods default `[GET, HEAD, POST]`; config: `withHeaderName()`, `withUnsafeMethods()`. |
| `CsrfTokenCookieMiddleware` | For SPA (JS-readable double-submit): publishes the token in an `XSRF-TOKEN` cookie; never trusts the cookie as input. Constructor: `(CsrfTokenInterface $token, string $cookieName, string $path = '/', ?string $domain = null, ?bool $secure = null, ?string $sameSite = 'Lax', bool|string $cacheControl = true)`. Place **before** `CsrfTokenMiddleware` so the token is published even on 422 responses. `$cacheControl: true` sets `Cache-Control: no-store`. |

Shipped DI (`config/di-web.php`): `CsrfTokenInterface::class` → `MaskedCsrfToken` wrapping
`SynchronizerCsrfToken` (generator `RandomCsrfTokenGenerator`, storage `SessionCsrfTokenStorage`); the
`HmacCsrfToken` wiring reads the only params key:

```php
'yiisoft/csrf' => [
    'hmacToken' => ['secretKey' => '', 'algorithm' => 'sha256', 'lifetime' => null],
],
```

> [!NOTE]
> There are **no** `headerName`/`parameterName`/`csrfToken` DI param keys — middleware names and safe methods
> are configured with the immutable `with*()` methods in the DI definition:
> `CsrfTokenMiddleware::class => ['withSafeMethods()' => [[Method::OPTIONS]], 'withHeaderName()' => ['X-CSRF-PROTECTION']]`.

### 5.3. Forms & AJAX Usage

Inject `CsrfTokenInterface` (the DI default already includes masking) into the action that renders a form, and
print the hidden field with the middleware's parameter name (`_csrf` by default):

```php
$csrf = $this->csrfToken->getValue();
// in the template: <input type="hidden" name="_csrf" value="<?= htmlspecialchars($csrf, ENT_QUOTES) ?>">
```

For AJAX: send the token via the `X-CSRF-Token` header, or use the cookie flow — a `GET /csrf-token` endpoint
returning the token, or `CsrfTokenCookieMiddleware` (cookie `XSRF-TOKEN` → client sends `X-XSRF-TOKEN`, matched
with `->withHeaderName('X-XSRF-TOKEN')`). There is no built-in integration with `yiisoft/form-model` /
`yiisoft/form` — the hidden field is rendered manually in templates (see [Validation & Forms Guide](validation-and-forms.md)
§6 for form rendering).

> [!IMPORTANT]
> `CsrfTokenMiddleware` reads the token from **parsed body** — for JSON payloads the body must be parsed by
> `Yiisoft\Request\Body\RequestBodyParser` first, or the token must arrive via the header instead
> (see [PSR-15 Middlewares Guide](middlewares.md)).

## 6. Worker Mode Notes

Under long-running runners (RoadRunner, FrankenPHP — see [Package Catalog](package-catalog.md) §16.3):

- Do **not** store per-request state in PHP superglobals or singleton properties; the `Session` object is a
  stateful wrapper around PHP session functions — middleware-driven open/close per request keeps it correct.
- The shipped `Session` DI definition includes a `reset` closure (closes the session and clears the id) — keep it
  when overriding the definition.
- `CsrfTokenMiddleware`'s synchronizer token lives in the session: stateful CSRF requires sessions to work in
  worker mode too; the HMAC token is an alternative for stateless setups.

## 7. Anti-Pattern Matrix

| Forbidden Anti-Pattern | Why it breaks | Idiomatic Yii3 Solution |
|---|---|---|
| Yii2-style `Yii::$app->session` / `Yii::$app->response->cookies` | No service locator in Yii3 | Inject `SessionInterface` / use `Cookie` + response (§2.1, §4.1) |
| Calling `$session->flash('key', $value)` | `Session` has no flash methods | Inject `FlashInterface` (`Yiisoft\Session\Flash\Flash`) (§3) |
| Type-hinting `Yiisoft\Session\Session` (concrete) | Blocks `NullSession` in tests and stateless contexts | Hint `SessionInterface` (§2.2) |
| Inventing `SessionConfiguration` / `RequestCookies` / `ResponseCookies` / `CsrfToken` classes | None of them exist in the current packages | Use the options array, `CookieCollection`, and `CsrfTokenInterface` (§2, §4, §5.1) |
| Writing cookies by manually building `Set-Cookie` strings | Easy to break encoding/attributes | Use `Cookie::addToResponse()` / `CookieCollection::setToResponse()` (§4) |
| Storing secrets in unsigned cookies | Client can read and tamper | Sign with `CookieSigner` or encrypt with `CookieEncryptor`; validate on read (§4.3) |
| CSRF middleware without session storage | Synchronizer token has nowhere to persist → new token per request, forms always fail | Register `SessionMiddleware` **before** CSRF, or switch to `HmacCsrfToken` (§1, §5.1) |
| Using deprecated `CsrfMiddleware` | Marked `@deprecated` in favor of `CsrfTokenMiddleware` | Use `CsrfTokenMiddleware` (§5.2) |
| Expecting `_csrf` in JSON body without `RequestBodyParser` | Parsed body is `null`; token never found → 422 | Parse JSON bodies upstream or send `X-CSRF-Token` header (§5.3) |
| Regenerating the session id only at login setup, never after privilege change | Session fixation remains possible | Call `$session->regenerateId()` after every privilege escalation |
| Keeping `cookie_secure: 0` in production | Session cookie travels over HTTP | Set `'cookie_secure' => 1` for HTTPS deployments (the middleware enforces scheme consistency) (§2.2, §2.3) |
| Rendering CSRF hidden inputs with a wrong parameter name after renaming the middleware | Token mismatch → every POST is 422 | Keep name and middleware config in sync; read `$csrfToken->getValue()` for the value, `_csrf` default for the name (§5.3) |
