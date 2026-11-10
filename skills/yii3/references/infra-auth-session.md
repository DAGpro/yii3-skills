# Yii3 Infrastructure: Stateful Web Session Authentication (`yiisoft/user`)

> [!IMPORTANT]
> **Grounding rule:** sources of truth are split by question type — API: installed `vendor/yiisoft/<pkg>/src/` (versions via `composer.lock`); implementation patterns: this guide; project conventions: the project's architecture artifact or dominant `src/` style. Full table and conflict rule: SKILL.md Core rule 2.

> Practical guide for stateful session-based web authentication in Yii3: `CurrentUser` service configuration, login/logout lifecycles, session ID regeneration (anti-fixation), web authenticator (`WebAuth`), remember-me cookies (`CookieLogin`), CSRF form protection, rate limiting, and PSR-14 authentication events.
>
> Complements [`infra-auth-and-rbac.md`](infra-auth-and-rbac.md) (identity models, password hashing, RBAC permissions, and middleware route protection).

---

## Table of Contents

- [1. `CurrentUser` Configuration & Timeouts](#1-currentuser-configuration--timeouts)
- [2. Full Login Lifecycle & Anti-Fixation](#2-full-login-lifecycle--anti-fixation)
  - [2.1. The 5-Step Login Sequence](#21-the-5-step-login-sequence)
  - [2.2. Login Action Implementation (`LoginAction.php`)](#22-login-action-implementation-loginactionphp)
- [3. Canonical Web Login Authenticator (`WebAuth`) & Identity Bridge](#3-canonical-web-login-authenticator-webauth--identity-bridge)
  - [3.1. `Yiisoft\User\Method\WebAuth`](#31-yiisoftusermethodwebauth)
  - [3.2. `Yiisoft\User\Login\LoginMiddleware`](#32-yiisoftuserloginloginmiddleware)
- [4. Full Logout Lifecycle & State Reset](#4-full-logout-lifecycle--state-reset)
  - [4.1. Logout Action Implementation (`LogoutAction.php`)](#41-logout-action-implementation-logoutactionphp)
  - [4.2. Long-Running Worker Reset (`StateResetter`)](#42-long-running-worker-reset-stateresetter)
- [5. Remember-Me Auto-Login Cookies (`CookieLogin`)](#5-remember-me-auto-login-cookies-cookielogin)
  - [5.1. Configuring `CookieLogin` in `config/web/di/auth.php`](#51-configuring-cookielogin-in-configwebdiauthphp)
  - [5.2. Attaching `CookieLoginMiddleware` to Pipeline](#52-attaching-cookieloginmiddleware-to-pipeline)
- [6. Web Login Security: CSRF & Brute-Force Rate Limiting](#6-web-login-security-csrf--brute-force-rate-limiting)
  - [6.1. CSRF Protection with `CsrfTokenMiddleware`](#61-csrf-protection-with-csrftokenmiddleware)
  - [6.2. Brute-Force Rate Limiting (`LimitRequestsMiddleware`)](#62-brute-force-rate-limiting-limitrequestsmiddleware)
- [7. PSR-14 User Authentication Events](#7-psr-14-user-authentication-events)
  - [7.1. Event Dispatch Sequence](#71-event-dispatch-sequence)
  - [7.2. Registering Event Listeners (`config/common/events.php`)](#72-registering-event-listeners-configcommoneventsphp)
  - [7.3. Listener Implementation Example](#73-listener-implementation-example)
- [8. Anti-Patterns & Common Traps](#8-anti-patterns--common-traps)
- [9. Related Guides](#9-related-guides)

---

## 1. `CurrentUser` Configuration & Timeouts

The `Yiisoft\User\CurrentUser` service manages the user session, guest state, and authorization checks.

In `config/web/di/auth.php`, configure `CurrentUser` with session storage and timeouts:

```php
declare(strict_types=1);

use Psr\EventDispatcher\EventDispatcherInterface;
use Yiisoft\Access\AccessCheckerInterface;
use Yiisoft\Auth\IdentityRepositoryInterface;
use Yiisoft\Session\SessionInterface;
use Yiisoft\User\CurrentUser;

return [
    CurrentUser::class => static function (
        IdentityRepositoryInterface $identityRepository,
        EventDispatcherInterface $eventDispatcher,
        SessionInterface $session,
        AccessCheckerInterface $accessChecker,
    ): CurrentUser {
        return (new CurrentUser($identityRepository, $eventDispatcher))
            ->withSession($session)
            ->withAccessChecker($accessChecker)
            // Sliding inactivity timeout: logout after 1800 seconds (30 mins) of idle time
            ->withAuthTimeout(1800)
            // Absolute timeout: force logout after 86400 seconds (24 hours) regardless of activity
            ->withAbsoluteAuthTimeout(86400);
    },
];
```

> [!NOTE]
> `CurrentUser` manages session auth keys (`SESSION_AUTH_ID`, `SESSION_AUTH_EXPIRE`, `SESSION_AUTH_ABSOLUTE_EXPIRE`) internally. Do not mutate these keys manually.

---

## 2. Full Login Lifecycle & Anti-Fixation

### 2.1. The 5-Step Login Sequence

When `$currentUser->login($identity)` is called:
1. **Event Dispatch:** Triggers `Yiisoft\User\Event\BeforeLogin`. If a listener calls `$event->invalidate()`, the login process aborts without switching identity, and `login()` returns whether the resulting identity is non-guest.
2. **Session Regeneration (Anti-Fixation):** Calls `$session->regenerateID()` to assign a fresh session ID, eliminating session fixation vulnerabilities.
3. **Session State Storage:**
   - Clears old auth session variables.
   - Stores user ID into the session auth key.
   - Computes and stores sliding timeout (`time() + $authTimeout`).
   - Computes and stores absolute timeout (`time() + $absoluteAuthTimeout`).
4. **Event Dispatch:** Triggers `Yiisoft\User\Event\AfterLogin`.
5. Returns `true` if authentication succeeded (`!$this->isGuest()`).

### 2.2. Login Action Implementation (`LoginAction.php`)

```php
declare(strict_types=1);

namespace App\Presentation\Action\Auth;

use App\Application\User\Service\UserAuthenticationService;
use DateInterval;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Yiisoft\DataResponse\ResponseFactory\DataResponseFactoryInterface;
use Yiisoft\Http\Status;
use Yiisoft\User\CurrentUser;
use Yiisoft\User\Login\Cookie\CookieLogin;

final readonly class LoginAction
{
    public function __construct(
        private CurrentUser $currentUser,
        private UserAuthenticationService $authService,
        private CookieLogin $cookieLogin,
        private DataResponseFactoryInterface $responseFactory,
    ) {}

    public function __invoke(ServerRequestInterface $request): ResponseInterface
    {
        $body = (array) $request->getParsedBody();
        $username = (string) ($body['username'] ?? '');
        $password = (string) ($body['password'] ?? '');
        $rememberMe = (bool) ($body['rememberMe'] ?? false);

        $identity = $this->authService->authenticate($username, $password);

        if ($identity === null) {
            return $this->responseFactory->createResponse(
                ['error' => 'Invalid credentials'],
                Status::UNAUTHORIZED,
            );
        }

        // 1. Log in user into session (regenerates session ID)
        $this->currentUser->login($identity);

        $response = $this->responseFactory->createResponse(['status' => 'authenticated']);

        // 2. Issue persistent remember-me cookie if requested
        if ($rememberMe) {
            $response = $this->cookieLogin->addCookie(
                $identity,
                $response,
                new DateInterval('P30D') // 30-day lifetime
            );
        }

        return $response;
    }
}
```

---

## 3. Canonical Web Login Authenticator (`WebAuth`) & Identity Bridge

In traditional web applications, unauthenticated users attempting to access protected routes must be redirected to a login page.

### 3.1. `Yiisoft\User\Method\WebAuth`

`Yiisoft\User\Method\WebAuth` implements `AuthenticatorWithChallengeInterface`. When challenged, it issues an HTTP 302 Found redirect to `/login` (customizable via `withAuthUrl()`):

> [!WARNING]
> `Yiisoft\User\UserAuth` is `@deprecated` and will be removed in the next major version. Always use `Yiisoft\User\Method\WebAuth`.

In `config/web/di/auth.php`:

```php
declare(strict_types=1);

use Psr\Http\Message\ResponseFactoryInterface;
use Yiisoft\Auth\AuthenticatorInterface;
use Yiisoft\Auth\AuthenticatorWithChallengeInterface;
use Yiisoft\User\CurrentUser;
use Yiisoft\User\Method\WebAuth;

return [
    WebAuth::class => static fn (
        CurrentUser $currentUser,
        ResponseFactoryInterface $responseFactory,
    ): WebAuth => (new WebAuth($currentUser, $responseFactory))
        ->withAuthUrl('/auth/login'),

    AuthenticatorInterface::class => WebAuth::class,
    AuthenticatorWithChallengeInterface::class => WebAuth::class,
];
```

### 3.2. `Yiisoft\User\Login\LoginMiddleware` (The Identity Bridge)

`Yiisoft\Auth\Middleware\Authentication` inspects credentials and places the authenticated `IdentityInterface` into the request attribute `Yiisoft\Auth\Middleware\Authentication::class`. However, it does not mutate `CurrentUser`.

`Yiisoft\User\Login\LoginMiddleware` bridges this gap: if `CurrentUser::isGuest()` is true, it reads the `Authentication::class` request attribute and automatically calls `$currentUser->login($identity)`. The pair is attached to route groups as `Authentication::class` followed by `LoginMiddleware::class` — see [`infra-auth-and-rbac.md`](infra-auth-and-rbac.md) §7.1 for the complete route-wiring example.

---

## 4. Full Logout Lifecycle & State Reset

When `$currentUser->logout()` is called:
1. Returns `false` immediately if `$currentUser->isGuest()`.
2. Triggers `Yiisoft\User\Event\BeforeLogout`. If a listener calls `$event->invalidate()`, logout aborts.
3. Switches identity to guest:
   - Calls `$session->regenerateID()`.
   - Clears session auth timeout keys.
4. Triggers `Yiisoft\User\Event\AfterLogout`.
5. Returns `true`.

### 4.1. Logout Action Implementation (`LogoutAction.php`)

```php
declare(strict_types=1);

namespace App\Presentation\Action\Auth;

use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Yiisoft\DataResponse\ResponseFactory\DataResponseFactoryInterface;
use Yiisoft\User\CurrentUser;
use Yiisoft\User\Login\Cookie\CookieLogin;

final readonly class LogoutAction
{
    public function __construct(
        private CurrentUser $currentUser,
        private CookieLogin $cookieLogin,
        private DataResponseFactoryInterface $responseFactory,
    ) {}

    public function __invoke(ServerRequestInterface $request): ResponseInterface
    {
        $this->currentUser->logout();

        $response = $this->responseFactory->createResponse(['status' => 'logged_out']);

        // Expire client auto-login cookie
        return $this->cookieLogin->expireCookie($response);
    }
}
```

### 4.2. Long-Running Worker Reset (`StateResetter`)

In persistent daemon runtimes (RoadRunner, FrankenPHP, Swoole), the `CurrentUser` singleton remains in memory across requests. It **must** be reset to avoid identity bleeding (User B inheriting User A's identity and privileges).

**Rely on built-in package resetters.** `yiisoft/user` already ships the correct reset closure for `CurrentUser` in its `config/di-web.php`:

```php
// vendor/yiisoft/user/config/di-web.php — shipped by the package; do NOT duplicate it:
CurrentUser::class => [
    'reset' => function () {
        $this->clear(); // Clears cached identity and identityOverride
    },
],
```

All official packages (`yiisoft/user`, `yiisoft/session`, `yiisoft/router`, etc.) contribute their own `'reset'` callbacks automatically — see the ground-truth catalog in [infra-state-resetter.md](infra-state-resetter.md), section 4. No application-level registration is required.

> [!CAUTION]
> **Never define or override `StateResetter::class` in application DI configuration.** An app-level definition is treated as a full override and silently disables every built-in package resetter — identity, session, route, and view state then leak across worker requests. Internal mechanics and full analysis: [Long-Running Worker Safety & StateResetter Guide, §2](infra-state-resetter.md#2-the-stateresetterclass-definition-trap).

---

## 5. Remember-Me Auto-Login Cookies (`CookieLogin`)

`yiisoft/user` provides `CookieLogin` and `CookieLoginMiddleware` to securely restore user sessions across browser visits without storing raw credentials:

```text
Browser Request ──> CookieLoginMiddleware
                         │
                         ├─ If Guest & Cookie Present:
                         │    1. Validates HMAC-SHA256 signature against secret key
                         │    2. Extracts user ID and login key
                         │    3. Finds identity in IdentityRepositoryInterface
                         │    4. Validates $identity->validateCookieLoginKey($key)
                         │    5. Checks lifetime expiration
                         │    6. Invokes $currentUser->login($identity)
                         │
                         ▼
                    Next Middleware / Handler
```

### 5.1. Configuring `CookieLogin` in `config/web/di/auth.php`

```php
declare(strict_types=1);

use DateInterval;
use Yiisoft\User\Login\Cookie\CookieLogin;

/** @var array $params */

return [
    CookieLogin::class => [
        '__construct()' => [
            'duration' => new DateInterval('P14D'), // 14-day lifetime; default null is a session cookie
            'signatureKey' => $params['app']['cookieAuthKey'], // Secret HMAC-SHA256 key
            'secureCookie' => true, // Enforce HTTPS
        ],
    ],
];
```

> [!WARNING]
> Always configure a strong `signatureKey` for `CookieLogin`. Without it, anyone able to edit cookies can tamper with user IDs and impersonate other accounts!

### 5.2. Attaching `CookieLoginMiddleware` to Pipeline

In authenticated web pipelines, register `CookieLoginMiddleware` after `SessionMiddleware` (remember-me auto-login needs the session) and before `Authentication` / `LoginMiddleware`, so the remembered identity is resolved before identity consumers run:

> [!TIP]
> **Global Middleware Pipeline Reference:**
> For the complete `Application::class` DI wiring and the canonical authenticated-pipeline order (`ErrorCatcher → SessionMiddleware → CsrfTokenMiddleware → CookieLoginMiddleware → Authentication → LoginMiddleware → Router`), see the [PSR-15 Middlewares Guide, §4.1 "Global Application Pipeline"](http-middlewares.md#41-global-application-pipeline-configwebdiapplicationphp).

---

## 6. Web Login Security: CSRF & Brute-Force Rate Limiting

### 6.1. CSRF Protection with `CsrfTokenMiddleware`

All state-changing web login forms must validate CSRF tokens using `Yiisoft\Csrf\CsrfTokenMiddleware`:

> [!WARNING]
> `Yiisoft\Csrf\CsrfMiddleware` is `@deprecated`. Always use `Yiisoft\Csrf\CsrfTokenMiddleware`.

**Pipeline ordering (auth-specific constraints only):** `SessionMiddleware` must precede `CsrfTokenMiddleware` (synchronizer tokens live in the session), and in the canonical authenticated pipeline `CsrfTokenMiddleware` runs before `CookieLoginMiddleware`.

```php
/** @var Yiisoft\Csrf\CsrfTokenInterface $csrfToken */
?>
<form method="post" action="/auth/login">
    <input type="hidden" name="_csrf" value="<?= \Yiisoft\Html\Html::encode($csrfToken->getValue()) ?>">
    <div class="mb-3">
        <label for="username">Username or Email</label>
        <input type="text" id="username" name="username" class="form-control" required>
    </div>
    <div class="mb-3">
        <label for="password">Password</label>
        <input type="password" id="password" name="password" class="form-control" required>
    </div>
    <div class="mb-3 form-check">
        <input type="checkbox" id="rememberMe" name="rememberMe" value="1" class="form-check-input">
        <label for="rememberMe" class="form-check-label">Remember me</label>
    </div>
    <button type="submit" class="btn btn-primary">Sign In</button>
</form>
```

### 6.2. Brute-Force Rate Limiting (`LimitRequestsMiddleware`)

Login endpoints are the primary target of credential-stuffing and brute-force dictionary attacks, so restrict repeated authentication attempts (typically per client IP) with `Yiisoft\Yii\RateLimiter\LimitRequestsMiddleware` (GCRA leaky bucket) before delegating to the login action:

> [!TIP]
> **Rate Limiting Reference:**
> For the complete reference on `yiisoft/rate-limiter` — DI configuration (`Counter`, `SimpleCacheStorage`, `LimitPerIp`), route-level attachment, custom per-user policies, and automatic `X-Rate-Limit-*` headers with HTTP 429 mapping — see the [PSR-15 Middlewares Guide, §4.4 "Rate Limiting Recipes"](http-middlewares.md#44-rate-limiting-recipes-yiisoftrate-limiter).

---

## 7. PSR-14 User Authentication Events

`yiisoft/user` dispatches four PSR-14 events during the login and logout cycles: `BeforeLogin`, `AfterLogin`, `BeforeLogout`, `AfterLogout`.

The full event table — payload accessors, the `invalidate()` veto semantics, and the `Yiisoft\Auth\IdentityInterface` import note — is owned by the [Events & Listeners Guide, §6.3](core-events-reference.md#63-user-authentication-lifecycle-yiisoftuser).

Auth-specific use cases:
- `BeforeLogin`/`BeforeLogout` are cancellable via `$event->invalidate()` (account suspension checks, maintenance lockouts, IP blacklists, mandatory workflow completion);
- `AfterLogin`/`AfterLogout` are observational (audit logging, `last_login_at` updates, brute-force counter resets, refresh-token revocation, cache purging).

### 7.1. Registering Event Listeners (`config/common/events.php`)

Map the file into the shared `events` group in `config/configuration.php` (`'events' => 'common/events.php'`); the base runner reverse-merges it into `events-web` — see [Events Guide, §4.1](core-events-and-listeners.md):

```php
declare(strict_types=1);

use App\Application\User\Listener\AuditLoginListener;
use App\Application\User\Listener\CheckUserActiveListener;
use Yiisoft\User\Event\AfterLogin;
use Yiisoft\User\Event\BeforeLogin;

return [
    BeforeLogin::class => [
        [CheckUserActiveListener::class, 'handle'],
    ],
    AfterLogin::class => [
        [AuditLoginListener::class, 'handle'],
    ],
];
```

### 7.2. Listener Implementation Example

```php
declare(strict_types=1);

namespace App\Application\User\Listener;

use App\Domain\User\Model\UserIdentity;
use Psr\Log\LoggerInterface;
use Yiisoft\User\Event\BeforeLogin;

final readonly class CheckUserActiveListener
{
    public function __construct(
        private LoggerInterface $logger,
    ) {}

    public function handle(BeforeLogin $event): void
    {
        $identity = $event->getIdentity();

        if ($identity instanceof UserIdentity && !$identity->isActive()) {
            $this->logger->warning("Blocked login attempt for inactive user #{$identity->getId()}");
            $event->invalidate(); // Aborts login process
        }
    }
}
```

---

## 8. Anti-Patterns & Common Traps

| Forbidden Anti-Pattern | Why it breaks Yii3 | Idiomatic Yii3 Solution |
|---|---|---|
| ❌ **`Yii::$app->user->login($identity)`** | Global static locator does not exist. | Inject `Yiisoft\User\CurrentUser` into the Action constructor and invoke `$this->currentUser->login($identity)`. |
| ❌ **Using deprecated `Yiisoft\User\UserAuth`** | `@deprecated` and removed in next major version. | Use `Yiisoft\User\Method\WebAuth`. |
| ❌ **Using deprecated `Yiisoft\Csrf\CsrfMiddleware`** | `@deprecated`. | Use `Yiisoft\Csrf\CsrfTokenMiddleware`. |
| ❌ **Manual manipulation of session auth keys** | `CurrentUser` manages expiration timestamps and session IDs internally; manual edits cause desynchronization. | Always invoke `$currentUser->login($identity)` or `$currentUser->logout()`. |
| ❌ **Forgetting session regeneration on login** | Exposes authenticated sessions to session fixation attacks. | `$currentUser->login()` regenerates the session ID automatically; do not suppress this behavior. |

---

## 9. Related Guides

- [Auth & RBAC Architecture Guide](infra-auth-and-rbac.md) — Identity models, password hashing, RBAC permissions, and middleware route protection.
- [Stateless REST API JWT Auth Guide](infra-auth-jwt.md) — Stateless Bearer token and JWT authentication.
- [OAuth2 & Social Login Guide](infra-auth-oauth2.md) — External authentication providers via `yiisoft/yii-auth-client`.
- [PSR-15 Middlewares Guide](http-middlewares.md) — Middleware pipeline ordering, CSRF, and rate limiting.
- [StateResetter & Long-Running Worker Safety Guide](infra-state-resetter.md) — Worker reset safety for `CurrentUser`.
