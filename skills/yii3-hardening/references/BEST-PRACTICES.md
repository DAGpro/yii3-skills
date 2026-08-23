# Security Best Practices Reference

General principles behind the hardening checklist (SKILL.md), per official guide
"Security / Best practices".

## Two Core Principles

1. **Filter input** - never treat input as safe; check values against allowed sets at reception
   point (validator rules / explicit whitelist for sort fields etc.).
2. **Escape output** - escape per context: HTML (`Html::encode()`), JS, SQL differ. Never escape
   manually when a tool exists.

## SQL Injection

Never concatenate user data into SQL:

```php
// WRONG: "SELECT * FROM user WHERE username = '$username'"
$username = $_GET['username'];
$sql = "SELECT * FROM user WHERE username = '$username'";
// attacker sends: '; DROP TABLE user; --
```

Use prepared statements / parameter binding (yiisoft/db does this for array conditions). For dynamic
column/table names allow only predefined values:

```php
if (!in_array($orderBy, ['name', 'status'], true)) {
    throw new InvalidArgumentException('Only name and status are allowed to order by.');
}
```

## XSS

Plain text output: `Html::encode($value)`. Trusted HTML from users: HtmlPurifier - heavy, cache its
results.

## CSRF

1. GET must never change application state (HTTP spec).
2. Keep `Yiisoft\Csrf\CsrfTokenMiddleware` in the stack for web.
3. AJAX/SPA backends with cookie auth: use `Yiisoft\Csrf\CsrfHeaderMiddleware` - custom request
   header + CORS preflight instead of form tokens.
4. SameSite cookies as second layer of CSRF protection.

## Debug Info in Production

Verbose errors reveal DB structure/config/code. No debug panels, no Gii in production; if truly
needed, restrict by IP. See `/yii3-errors` renderers and `yii3-hardening` checklist.

## Server Configuration

- **Webroot** must point to `public/`. On shared hosting without that option: deny everything except
  web-accessible files, or move hosting.
- **Host-header attacks**: serve the site only for configured host names (Apache vhosts / nginx
  server blocks) - Host header is client-controlled otherwise.
- **TLS everywhere** (Let's Encrypt makes it free) - cookies/sessions depend on it.

## SSL Peer Validation (outgoing clients)

On `cURL error 60` / certificate verify failures NEVER disable peer verification (MITM risk).
Fix PHP config instead:

```ini
openssl.cafile="/path/to/cacert.pem"
curl.cainfo="/path/to/cacert.pem"
```

Keep cacert.pem updated. Relevant for `/yii3-http-client`.
