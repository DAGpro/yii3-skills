# Yii3 Mailer & Email Notifications Guide

> Practical guide and configuration recipes for composing, rendering HTML templates, attaching files, embedding inline assets, and sending emails via `yiisoft/mailer` and `yiisoft/mailer-symfony`, including background delivery through `yiisoft/queue`.

---

## Table of Contents
- [1. Mailer Architecture & Contracts](#1-mailer-architecture--contracts)
- [2. Transport & DSN Configuration](#2-transport--dsn-configuration)
  - [2.1. Production SMTP Configuration (yiisoft/mailer-symfony)](#21-production-smtp-configuration-yiisoftmailer-symfony)
  - [2.2. Development & Testing Mailers (FileMailer, StubMailer, NullMailer)](#22-development--testing-mailers-filemailer-stubmailer-nullmailer)
- [3. Composing & Sending Messages](#3-composing--sending-messages)
  - [3.1. Basic Plain Text & HTML Message Service](#31-basic-plain-text--html-message-service)
  - [3.2. Batch Sending with sendMultiple() and SendResults](#32-batch-sending-with-sendmultiple-and-sendresults)
  - [3.3. Priority, Sender, Return-Path, and Custom Headers](#33-priority-sender-return-path-and-custom-headers)
- [4. HTML Templating & View Rendering](#4-html-templating--view-rendering)
  - [4.1. Rendering via ViewInterface (Recommended)](#41-rendering-via-viewinterface-recommended)
  - [4.2. Rendering via WebViewRenderer (renderPartialAsString)](#42-rendering-via-webviewrenderer-renderpartialasstring)
  - [4.3. Email View Template with HTML Escaping](#43-email-view-template-with-html-escaping)
- [5. File Attachments & Inline Embeddings](#5-file-attachments--inline-embeddings)
  - [5.1. Attaching Files from Disk](#51-attaching-files-from-disk)
  - [5.2. Attaching In-Memory Generated Content](#52-attaching-in-memory-generated-content)
  - [5.3. Embedding Inline Images with Content-ID (CID)](#53-embedding-inline-images-with-content-id-cid)
- [6. Asynchronous Background Sending via Queue & PSR-14](#6-asynchronous-background-sending-via-queue--psr-14)
  - [6.1. Domain Event DTO](#61-domain-event-dto)
  - [6.2. Queue Message DTO](#62-queue-message-dto)
  - [6.3. PSR-14 Listener Enqueuing Job](#63-psr-14-listener-enqueuing-job)
  - [6.4. Queue Consumer Handler](#64-queue-consumer-handler)
  - [6.5. Queue & Event Configuration](#65-queue--event-configuration)
- [7. Mailer Lifecycle Events (BeforeSend & AfterSend)](#7-mailer-lifecycle-events-beforesend--aftersend)
  - [7.1. Suppressing Delivery via BeforeSend](#71-suppressing-delivery-via-beforesend)
  - [7.2. Audit Logging via AfterSend](#72-audit-logging-via-aftersend)
- [8. Testing Recipes (StubMailer)](#8-testing-recipes-stubmailer)
- [9. Anti-Pattern Matrix](#9-anti-pattern-matrix)

---

## 1. Mailer Architecture & Contracts

Yii3 separates email composition, transport implementations, and lifecycle events into clean decoupled contracts:

| Interface / Class | FQCN | Responsibility |
|---|---|---|
| **`MailerInterface`** | `Yiisoft\Mailer\MailerInterface` | High-level contract for sending messages (`send(): void` for a single message and `sendMultiple(array $messages): SendResults`). |
| **`MessageInterface`** | `Yiisoft\Mailer\MessageInterface` | Immutable contract for message metadata (recipients, subject, charset, dates, headers). |
| **`Message`** | `Yiisoft\Mailer\Message` | Concrete immutable message implementation with fluent `with*()` methods. |
| **`BaseMailer`** | `Yiisoft\Mailer\BaseMailer` | Abstract base implementing the send pipeline: applies `MessageSettings` defaults, dispatches `BeforeSend`/`AfterSend`, delegates delivery to `sendMessage()`. |
| **`MessageSettings`** | `Yiisoft\Mailer\MessageSettings` | Default message settings applied at send time (plain keys fill `null` fields, `add*` keys always append). |
| **`File`** | `Yiisoft\Mailer\File` | Value object for file attachments and embedded inline media. |
| **`SendResults`** | `Yiisoft\Mailer\SendResults` | DTO returned by `sendMultiple()` containing public `$successMessages` and `$failMessages`. |
| **`Priority`** | `Yiisoft\Mailer\Priority` | Backed integer enum (`HIGHEST = 1`, `HIGH = 2`, `NORMAL = 3`, `LOW = 4`, `LOWEST = 5`) for email priority. |
| **`Symfony\Mailer`** | `Yiisoft\Mailer\Symfony\Mailer` | Official bridge adapter executing sends over `symfony/mailer` transport. |
| **`FileMailer`** | `Yiisoft\Mailer\FileMailer` | Development mailer writing `.eml` files to disk without external network calls. |
| **`StubMailer`** | `Yiisoft\Mailer\StubMailer` | In-memory testing mailer storing sent messages for unit test assertions (`getMessages()`). |
| **`NullMailer`** | `Yiisoft\Mailer\NullMailer` | Discarding mailer silently dropping all messages without sending. |
| **`BeforeSend`** | `Yiisoft\Mailer\Event\BeforeSend` | PSR-14 event dispatched before message delivery; can cancel delivery via `$preventSendingMessage`. |
| **`AfterSend`** | `Yiisoft\Mailer\Event\AfterSend` | PSR-14 event dispatched immediately after successful message delivery. |

**Installation:** `composer require yiisoft/mailer yiisoft/mailer-symfony`. The bridge requires `symfony/mailer ^6.0||^7.0||^8.0` and `yiisoft/mailer ^6.0.1` (PHP 8.1–8.5). `yiisoft/mailer` alone is sufficient for `FileMailer`, `StubMailer`, `NullMailer`, and tests.

---

## 2. Transport & DSN Configuration

### 2.1. Production SMTP Configuration (`yiisoft/mailer-symfony`)

`yiisoft/mailer-symfony` wraps Symfony Mailer transports. The transport and global message defaults are configured under the `'yiisoft/mailer-symfony'` params key, conventionally in `config/common/params.php`:

```php
<?php

declare(strict_types=1);

return [
    'yiisoft/mailer-symfony' => [
        // false (default): build an EsmtpTransport from 'esmtpTransport' below.
        // true: swap the transport definition to SendmailTransport instead.
        'useSendmail' => false,
        'esmtpTransport' => [
            'scheme' => 'smtps', // "smtps" = using TLS; "smtp" = without using TLS
            'host' => 'smtp.example.com',
            'port' => 465,
            'username' => (string) ($_ENV['MAILER_USERNAME'] ?? 'apikey'),
            'password' => (string) ($_ENV['MAILER_PASSWORD'] ?? ''), // never hardcode SMTP credentials
            'options' => [], // Free-form options array forwarded to the transport Dsn (TLS peer verification per the package comment)
        ],
        'messageSettings' => [
            'from' => ['no-reply@example.com' => 'My Application'],
            'convertHtmlToText' => true, // Package default: fills the text body from HTML when no text body is set
        ],
    ],
];
```

Transport notes:

- The package documents only two scheme semantics: `"smtps": using TLS`, `"smtp": without using TLS`. The shipped `smtps` default pairs with port `465`. Do not assume any other scheme/port mapping (e.g. STARTTLS) beyond what your SMTP provider documents.
- The package assembles the transport Dsn from these keys as `new Dsn($scheme, $host, $username, $password, $port, $options)` — note that the username and password precede the port positionally in the Dsn constructor.
- There is **no** sendmail-path parameter and **no** raw `'dsn'` string parameter — configuration is limited to the structured keys above. If you need a raw DSN string, override the `TransportInterface` DI definition manually in application config.
- Setting `'useSendmail' => true` swaps the `TransportInterface::class` definition to `SendmailTransport::class`.

The package auto-registers `MailerInterface::class => Yiisoft\Mailer\Symfony\Mailer::class` and the `TransportInterface` definition via its config plugin. It does **not** bind `Psr\EventDispatcher\EventDispatcherInterface` — supply one to enable the lifecycle events described in §7.

**Message defaults (`messageSettings`).** The full 25-key set, in package order (keys map onto `Yiisoft\Mailer\MessageSettings`):

```php
<?php

declare(strict_types=1);

return [
    'yiisoft/mailer-symfony' => [
        'messageSettings' => [
            // Plain keys fill only message fields that are still NULL at send time:
            'charset' => null,
            'from' => null,            // [email => name] map, plain string, or list of emails
            'addFrom' => null,         // "add*" keys ALWAYS append to the corresponding field
            'to' => null,
            'addTo' => null,
            'replyTo' => null,
            'addReplyTo' => null,
            'cc' => null,
            'addCc' => null,
            'bcc' => null,
            'addBcc' => null,
            'subject' => null,
            'date' => null,
            'priority' => null,
            'returnPath' => null,
            'sender' => null,
            'textBody' => null,
            'htmlBody' => null,
            'attachments' => null,
            'addAttachments' => null,
            'embeddings' => null,
            'addEmbeddings' => null,
            'headers' => null,          // merged with message headers; message headers win
            'overwriteHeaders' => null, // always applied via withHeader()
            'convertHtmlToText' => true,
        ],
    ],
];
```

Semantics (applied inside `BaseMailer::send()` **before** the `BeforeSend` dispatch, via `MessageSettings::applyTo()`):

- Package defaults: every key is `null` except `'convertHtmlToText' => true`.
- Plain keys fill only message fields that are still `null`; `add*` keys always append.
- `'headers'` merges with the message headers — message headers win on name conflicts; `'overwriteHeaders'` is always applied via `withHeader()`.
- `'convertHtmlToText' => true` fills the text body from the HTML body **only when the message has no text body**, using `Yiisoft\Mailer\HtmlToTextBodyConverter`: it extracts the `<body>` inner HTML, strips `<style>`/`<script>` blocks, applies `strip_tags` + `html_entity_decode`, and normalizes whitespace.
- Address-valued keys accept a plain string, a list of emails, or an `[email => name]` map.

### 2.2. Development & Testing Mailers (`FileMailer`, `StubMailer`, `NullMailer`)

No `yiisoft/*` package ships a `MailerInterface` binding for development or testing — choosing `FileMailer`, `StubMailer`, or `NullMailer` for an environment is an **application decision** (application convention, not package default).

Configuration placement (the app template registers only `config/environments/{dev,test,prod}/params.php` — there are **no** per-environment `di.php` files):

- **Params overrides** go to `config/environments/dev/params.php` / `config/environments/test/params.php`.
- **DI overrides** go to `config/common/di/*.php` (auto-globbed by the template, shared across all environments) or to a custom config group registered in `config/configuration.php` (the same mechanism the template uses for per-environment params and events groups), followed by `composer yii-config-rebuild`.

#### Local Development with `FileMailer`

For local development where you want to inspect `.eml` files in your runtime directory without sending real emails, configure the path in `config/environments/dev/params.php`:

```php
<?php

declare(strict_types=1);

return [
    'yiisoft/mailer' => [
        'fileMailer' => [
            'path' => '@runtime/mail',
        ],
    ],
];
```

Bind `FileMailer` as `MailerInterface` via a DI definition scoped to development (custom config group registered in `config/configuration.php`, then `composer yii-config-rebuild`):

```php
<?php

declare(strict_types=1);

use Yiisoft\Mailer\FileMailer;
use Yiisoft\Mailer\MailerInterface;

return [
    MailerInterface::class => FileMailer::class,
];
```

`FileMailer` facts:

- Constructor: `__construct(string $path, ?callable $filenameCallback = null, ?MessageSettings $messageSettings = null, ?EventDispatcherInterface $eventDispatcher = null)` — `path` is required and first (named arguments `path:`, `filenameCallback:`, `messageSettings:`, `eventDispatcher:`).
- `sendMessage()` writes `(string) $message` to `<path>/<filename>`, creating the directory recursively (`mkdir(..., 0777, true)`). The default filename is a timestamped `.eml` name (date prefix with microsecond and random suffixes); `$filenameCallback` (`fn(MessageInterface $message): string`) overrides it — a non-string return throws `LogicException('Filename must be a string. "%s" received.')`.
- The `@`-prefixed `'@runtime/mail'` default is resolved by the package's DI definition via `Yiisoft\Aliases\Aliases` inside a `DynamicReference` closure. Without an Aliases service it throws `LogicException('yiisoft/aliases dependency is required to resolve path "@runtime/mail".')`. An absolute path needs no aliases; `FileMailer` itself never resolves aliases.
- **`.eml` caveat:** the file content is `Message::__toString()`, which serializes **only custom headers + text body** — not the HTML body, attachments, or standard headers. The `.eml` file is a debug artifact, not a full RFC-822 rendering.

#### Automated Testing with `StubMailer`

In automated integration and unit test environments, bind `StubMailer` as `MailerInterface` (application convention — e.g. a custom config group for the test environment) so all emails are kept in memory:

```php
<?php

declare(strict_types=1);

use Yiisoft\Mailer\MailerInterface;
use Yiisoft\Mailer\StubMailer;

return [
    MailerInterface::class => StubMailer::class,
];
```

`StubMailer` is `final`, implements `MailerInterface`, and has **no constructor** (instantiate with `new StubMailer()`). See §8 for assertion recipes.

#### Disabling Mail with `NullMailer`

`NullMailer` is `final` with no constructor: `send()` is an empty no-op and `sendMultiple()` reports every message as successful with no failures. Per its docblock, "This mailer can be used to avoid sending messages" — bind `MailerInterface::class => NullMailer::class` where an environment must neither send nor persist mail.

When `yiisoft/yii-debug` is installed, `yiisoft/mailer`'s package params additionally register a `MailerCollector` and a `MailerInterfaceProxy` for `MailerInterface::class`.

---

## 3. Composing & Sending Messages

Messages in Yii3 are **immutable value objects**. Every configuration method returns a cloned instance, leaving the original object unchanged.

### 3.1. Basic Plain Text & HTML Message Service

```php
<?php

declare(strict_types=1);

namespace App\Application\Notification\Service;

use Yiisoft\Mailer\MailerInterface;
use Yiisoft\Mailer\Message;

final readonly class EmailNotificationService
{
    public function __construct(
        private MailerInterface $mailer,
    ) {}

    public function sendWelcomeNotification(string $recipientEmail, string $recipientName): void
    {
        $message = (new Message())
            ->withTo([$recipientEmail => $recipientName])
            ->withSubject('Welcome to Our Service')
            ->withTextBody("Hello {$recipientName},\n\nThank you for signing up!")
            ->withHtmlBody("<p>Hello <strong>{$recipientName}</strong>,</p><p>Thank you for signing up!</p>");

        $this->mailer->send($message);
    }
}
```

Notes:

- `new Message(...)` accepts 16 all-optional constructor parameters in order: `charset`, `from`, `to`, `replyTo`, `cc`, `bcc`, `subject`, `date`, `priority`, `returnPath`, `sender`, `textBody`, `htmlBody`, `attachments`, `embeddings`, `headers` — `new Message(subject: 'x', to: 'a@b.c')` is valid.
- Every address setter (`withTo()`, `withFrom()`, `withReplyTo()`, `withCc()`, `withBcc()`) accepts a plain string, a list of emails, or an `[email => name]` map.
- The charset stays `null` unless set explicitly via `withCharset(?string $charset)`; the Symfony bridge then encodes bodies with a `utf-8` fallback.

### 3.2. Batch Sending with `sendMultiple()` and `SendResults`

When dispatching distinct messages in batch, use `MailerInterface::sendMultiple()`. The method returns a `Yiisoft\Mailer\SendResults` object containing public properties:
- `public readonly array $successMessages`: `list<MessageInterface>` of messages sent successfully.
- `public readonly array $failMessages`: `list<array{message: MessageInterface, error: \Throwable}>` of messages that failed to send.

Failure semantics differ between the two methods: a single `send()` rethrows the transport exception, while `sendMultiple()` wraps every message in a try/catch — a failure lands in `$failMessages` as `['message' => ..., 'error' => $e]` and the loop continues to the next message.

```php
<?php

declare(strict_types=1);

namespace App\Application\Newsletter\Service;

use Psr\Log\LoggerInterface;
use Yiisoft\Mailer\MailerInterface;
use Yiisoft\Mailer\Message;
use Yiisoft\Mailer\SendResults;

final readonly class DigestSenderService
{
    public function __construct(
        private MailerInterface $mailer,
        private LoggerInterface $logger,
    ) {}

    /**
     * @param list<array{email: string, name: string}> $recipients
     */
    public function sendWeeklyDigest(array $recipients, string $digestHtml): SendResults
    {
        $messages = [];
        foreach ($recipients as $recipient) {
            $messages[] = (new Message())
                ->withTo([$recipient['email'] => $recipient['name']])
                ->withSubject('Weekly Digest')
                ->withHtmlBody($digestHtml);
        }

        $results = $this->mailer->sendMultiple($messages);

        if ($results->failMessages !== []) {
            foreach ($results->failMessages as $failure) {
                $failedMessage = $failure['message'];
                $error = $failure['error'];

                $this->logger->error(
                    'Failed sending digest email to {recipient}: {error}',
                    [
                        'recipient' => json_encode($failedMessage->getTo()),
                        'error' => $error->getMessage(),
                        'exception' => $error,
                    ],
                );
            }
        }

        return $results;
    }
}
```

### 3.3. Priority, Sender, Return-Path, and Custom Headers

```php
<?php

declare(strict_types=1);

namespace App\Application\Security\Service;

use DateTimeImmutable;
use Yiisoft\Mailer\MailerInterface;
use Yiisoft\Mailer\Message;
use Yiisoft\Mailer\Priority;

final readonly class SecurityAlertSender
{
    public function __construct(
        private MailerInterface $mailer,
    ) {}

    public function sendSecurityAlert(string $email, string $ipAddress): void
    {
        $message = (new Message())
            ->withTo($email)
            ->withSubject('URGENT: Suspicious Login Detected')
            ->withPriority(Priority::HIGHEST)
            ->withDate(new DateTimeImmutable())
            ->withSender('security-daemon@example.com')
            ->withReturnPath('bounces@example.com')
            ->withHeader('X-Security-Alert-Level', 'Critical')
            ->withAddedHeader('X-Event-Source-IP', $ipAddress)
            ->withTextBody("A new login was recorded from IP {$ipAddress}. If this was not you, lock your account immediately.");

        $this->mailer->send($message);
    }
}
```

Signatures worth remembering (named-argument safe):

- `withSubject(?string $subject)`, `withTextBody(?string $text)`, `withHtmlBody(?string $html)` — all nullable; passing `null` resets the field.
- `withPriority(?Priority $priority)` — passing `null` resets the priority.
- `withDate(?DateTimeInterface $date)` — non-immutable values are converted via `DateTimeImmutable::createFromInterface()`.
- `withSender(?string $address)`, `withReturnPath(?string $address)`, `withCharset(?string $charset)`.

**Header semantics:** `withHeader(string $name, string|array $value)` **replaces** all values stored under that name — repeat calls with the same name overwrite the previous ones. To accumulate multiple values under one name, use `withAddedHeader(string $name, string $value)`. `withHeaders(?array $headers)` bulk-sets a `[name => value|value[]]` map. Read them back with `getHeader(string $name): array` (all values of one header) or `getHeaders(): ?array` (the full map).

```php
<?php

declare(strict_types=1);

use Yiisoft\Mailer\Message;

$message = (new Message())->withHeader('X-Event-Source-IP', '10.0.0.1');

// Repeating withHeader() on the same name REPLACES all its values:
$message = $message->withHeader('X-Event-Source-IP', '10.0.0.1');

// Accumulate multiple values under one name with withAddedHeader():
$message = $message
    ->withAddedHeader('X-Event-Source-IP', '10.0.0.2')
    ->withAddedHeader('X-Event-Source-IP', '10.0.0.3');

// getHeader() returns every stored value for the name:
// ['10.0.0.1', '10.0.0.2', '10.0.0.3']
$allSourceIps = $message->getHeader('X-Event-Source-IP');
```

---

## 4. HTML Templating & View Rendering

Emails should be formatted using reusable PHP view templates instead of large string concatenations.

> [!IMPORTANT]
> **View Rendering Return Types:**
> - When using `Yiisoft\View\ViewInterface`, calling `render(string $view, array $parameters = []): string` returns the rendered HTML `string` directly. This is the **recommended** approach for domain services and queue workers.
> - When using `Yiisoft\Yii\View\Renderer\WebViewRenderer`, you **must** call `renderPartialAsString(string $view, array $parameters = []): string`. The first parameter is named **`$view`** — a named-argument call `renderPartialAsString(name: ...)` is a PHP fatal error; pass arguments positionally or use `view:`.
> - Calling `renderPartial()` returns a PSR-7 `ResponseInterface` (an `@internal` `ViewResponse` for `WebViewRenderer`), **not** a string. Passing that object into `$message->withHtmlBody(?string $html)` throws a `TypeError`.

**View name resolution** (applies to both `ViewInterface::render()` and `renderPartialAsString()`):

| Syntax | Anchor |
|---|---|
| `//email/order-confirmation` | View **base path** (`getBasePath()`); any context view path is ignored. This is not an alias. |
| `email/order-confirmation` | **Context view path** (`ViewContextInterface::getViewPath()`); `WebViewRenderer` supplies itself as the context, so relative names resolve under the configured `viewPath`. |
| `./partial` / `../partial` | Sibling / parent directory of the currently rendered view. |
| `/absolute/path/view` | Absolute path, used as-is. |

The `.php` suffix is appended automatically when missing. Relative names require a configured view path: `yiisoft/yii-view-renderer` ships `'viewPath' => null` by default and `getViewPath()` throws `LogicException('The view path is not set.')` until the application configures it (alias-resolved, e.g. `@views`). The `views/` directory name used in the examples below is an **application convention**, not a package default.

### 4.1. Rendering via `ViewInterface` (Recommended)

```php
<?php

declare(strict_types=1);

namespace App\Application\Order\Service;

use Yiisoft\Mailer\MailerInterface;
use Yiisoft\Mailer\Message;
use Yiisoft\View\ViewInterface;

final readonly class OrderEmailSender
{
    public function __construct(
        private MailerInterface $mailer,
        private ViewInterface $view,
    ) {}

    /**
     * @param array{id: int, customer_name: string, total: int, items: list<array{title: string, qty: int, price: int}>} $orderData
     */
    public function sendOrderConfirmation(string $email, array $orderData): void
    {
        // Renders <view base path>/email/order-confirmation.php ("//" anchors at the base path)
        $html = $this->view->render('//email/order-confirmation', [
            'order' => $orderData,
        ]);

        $message = (new Message())
            ->withTo($email)
            ->withSubject("Order #{$orderData['id']} Confirmation")
            ->withHtmlBody($html);

        $this->mailer->send($message);
    }
}
```

### 4.2. Rendering via `WebViewRenderer` (`renderPartialAsString`)

If your service is wired to `Yiisoft\Yii\View\Renderer\WebViewRenderer`, explicitly use `renderPartialAsString()`. A relative view name resolves under the configured `viewPath` because the renderer acts as its own view context:

```php
<?php

declare(strict_types=1);

namespace App\Application\Order\Service;

use Yiisoft\Mailer\MailerInterface;
use Yiisoft\Mailer\Message;
use Yiisoft\Yii\View\Renderer\WebViewRenderer;

final readonly class OrderEmailSenderWithWebViewRenderer
{
    public function __construct(
        private MailerInterface $mailer,
        private WebViewRenderer $viewRenderer,
    ) {}

    /**
     * @param array{id: int, customer_name: string, total: int, items: list<array{title: string, qty: int, price: int}>} $orderData
     */
    public function sendOrderConfirmation(string $email, array $orderData): void
    {
        // Always call renderPartialAsString() to receive raw HTML string
        $html = $this->viewRenderer->renderPartialAsString('email/order-confirmation', [
            'order' => $orderData,
        ]);

        $message = (new Message())
            ->withTo($email)
            ->withSubject("Order #{$orderData['id']} Confirmation")
            ->withHtmlBody($html);

        $this->mailer->send($message);
    }
}
```

The deprecated sibling `Yiisoft\Yii\View\Renderer\ViewRenderer` (`@deprecated` since 7.4.0 — use `WebViewRenderer` instead) exposes `renderPartial(): DataResponse`. `Yiisoft\DataResponse\DataResponse` is itself `@deprecated`; do not adopt either for new code.

### 4.3. Email View Template with HTML Escaping

Template located at `<viewPath>/email/order-confirmation.php` (the `views/` directory name is an application convention — see View name resolution above):

```php
<?php

declare(strict_types=1);

use Yiisoft\Html\Html;

/**
 * @var array{id: int, customer_name: string, total: int, items: list<array{title: string, qty: int, price: int}>} $order
 */
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <title>Order Confirmation #<?= Html::encode($order['id']) ?></title>
    <style>
        body { font-family: sans-serif; line-height: 1.6; color: #333; }
        .order-table { width: 100%; border-collapse: collapse; margin-top: 16px; }
        .order-table th, .order-table td { border: 1px solid #ddd; padding: 8px; text-align: left; }
        .total { font-weight: bold; margin-top: 16px; }
    </style>
</head>
<body>
    <h1>Thank you for your order, <?= Html::encode($order['customer_name']) ?>!</h1>
    <p>Your order <strong>#<?= Html::encode($order['id']) ?></strong> has been received.</p>

    <table class="order-table">
        <thead>
            <tr>
                <th>Item</th>
                <th>Qty</th>
                <th>Price</th>
            </tr>
        </thead>
        <tbody>
            <?php foreach ($order['items'] as $item): ?>
                <tr>
                    <td><?= Html::encode($item['title']) ?></td>
                    <td><?= Html::encode($item['qty']) ?></td>
                    <td>$<?= number_format($item['price'] / 100, 2) ?></td>
                </tr>
            <?php endforeach; ?>
        </tbody>
    </table>

    <p class="total">Order Total: $<?= number_format($order['total'] / 100, 2) ?></p>
</body>
</html>
```

**Escaping facts:** `Yiisoft\Html\Html::encode(mixed $content, bool $doubleEncode = true, string $encoding = 'UTF-8'): string` encodes only `&`, `<`, and `>` (quotes are NOT encoded) and turns `null` into `''`. It is safe for text nodes but **not** for HTML attribute values — use `Html::encodeAttribute(mixed $value, bool $doubleEncode = true, string $encoding = 'UTF-8')` (encodes quotes too) whenever dynamic data lands inside an attribute.

**Localized bodies:** for per-recipient translations, inject `Yiisoft\Translator\TranslatorInterface` and render `TranslatorInterface::translate(string|Stringable $id, array $parameters = [], ?string $category = null, ?string $locale = null): string` (returns the source ID when no translation exists). Scope a locale with `withLocale(string $locale): static`, which returns a cloned translator instance.

---

## 5. File Attachments & Inline Embeddings

`Yiisoft\Mailer\File` encapsulates both regular file attachments and inline media.
- Factory method `File::fromPath(string $path, ?string $name = null, ?string $contentType = null): self` — throws a `RuntimeException` when the path does not exist as a **file** (a directory also throws).
- Factory method `File::fromContent(string $content, ?string $name = null, ?string $contentType = null): self` — performs **no** MIME auto-detection; `contentType` is used as passed.
- Method `id(): string` returns a lazily generated, cached 36-character Content-ID ending in `@app`.
- Method `cid(): string` returns `"cid:{$this->id()}"` for referencing inline in HTML.
- In the Symfony bridge, embeddings are sent inline (`asInline()`) while attachments are not; every part receives `setContentId($file->id())`.

### 5.1. Attaching Files from Disk

```php
<?php

declare(strict_types=1);

namespace App\Application\Billing\Service;

use Yiisoft\Aliases\Aliases;
use Yiisoft\Mailer\File;
use Yiisoft\Mailer\MailerInterface;
use Yiisoft\Mailer\Message;

final readonly class InvoiceEmailSender
{
    public function __construct(
        private MailerInterface $mailer,
        private Aliases $aliases,
    ) {}

    public function sendInvoice(string $recipientEmail, string $invoiceId): void
    {
        $filePath = $this->aliases->get("@runtime/invoices/{$invoiceId}.pdf");

        $attachment = File::fromPath(
            path: $filePath,
            name: "Invoice_{$invoiceId}.pdf",
            contentType: 'application/pdf',
        );

        $message = (new Message())
            ->withTo($recipientEmail)
            ->withSubject("Invoice #{$invoiceId}")
            ->withTextBody('Please find your invoice attached.')
            ->withAttachments($attachment); // Accepts variadic File ...$files

        $this->mailer->send($message);
    }
}
```

`Yiisoft\Aliases\Aliases::get(string $alias): string` performs pure string translation: non-`@` input is returned unchanged, and an unknown root alias throws `InvalidArgumentException('Invalid path alias: ...')`. The aliases themselves (`@runtime`, `@resources`, ...) are **provided by the application** — the default `yiisoft/aliases` map is empty — and resolution never touches the filesystem.

### 5.2. Attaching In-Memory Generated Content

For generated CSVs, spreadsheets, or runtime reports without saving temporary files to disk:

```php
<?php

declare(strict_types=1);

namespace App\Application\Export\Service;

use Yiisoft\Mailer\File;
use Yiisoft\Mailer\MailerInterface;
use Yiisoft\Mailer\Message;

final readonly class CsvExportEmailSender
{
    public function __construct(
        private MailerInterface $mailer,
    ) {}

    /**
     * @param list<array{id: int, name: string, email: string}> $users
     */
    public function sendUsersCsv(string $adminEmail, array $users): void
    {
        $buffer = fopen('php://memory', 'r+');
        fputcsv($buffer, ['ID', 'Name', 'Email']);
        foreach ($users as $user) {
            fputcsv($buffer, [$user['id'], $user['name'], $user['email']]);
        }
        rewind($buffer);
        $csvContent = (string) stream_get_contents($buffer);
        fclose($buffer);

        $csvFile = File::fromContent(
            content: $csvContent,
            name: 'users_export.csv',
            contentType: 'text/csv',
        );

        $message = (new Message())
            ->withTo($adminEmail)
            ->withSubject('Requested User Export')
            ->withTextBody('Attached is your requested CSV export.')
            ->withAttachments($csvFile);

        $this->mailer->send($message);
    }
}
```

### 5.3. Embedding Inline Images with Content-ID (CID)

To display images inline within HTML email bodies (such as logos or banners) without linking to external third-party servers:

```php
<?php

declare(strict_types=1);

namespace App\Application\Marketing\Service;

use Yiisoft\Aliases\Aliases;
use Yiisoft\Mailer\File;
use Yiisoft\Mailer\MailerInterface;
use Yiisoft\Mailer\Message;

final readonly class BrandedNotificationSender
{
    public function __construct(
        private MailerInterface $mailer,
        private Aliases $aliases,
    ) {}

    public function sendBrandedMessage(string $recipientEmail, string $userName): void
    {
        $logo = File::fromPath(
            path: $this->aliases->get('@resources/mail/logo.png'),
            name: 'company_logo.png',
            contentType: 'image/png',
        );

        // Reference the CID URL directly inside the HTML markup:
        $html = <<<HTML
        <!DOCTYPE html>
        <html>
        <body>
            <p><img src="{$logo->cid()}" alt="Company Logo" width="180"></p>
            <h2>Hello {$userName},</h2>
            <p>Welcome to our platform!</p>
        </body>
        </html>
        HTML;

        $message = (new Message())
            ->withTo($recipientEmail)
            ->withSubject('Welcome to Our Platform')
            ->withEmbeddings($logo) // Embeddings are marked inline by the Symfony bridge
            ->withHtmlBody($html);

        $this->mailer->send($message);
    }
}
```

---

## 6. Asynchronous Background Sending via Queue & PSR-14

> [!IMPORTANT]
> **Performance Rule:** Never send emails synchronously inside an HTTP request action. The SMTP handshake, TLS negotiation, and network roundtrips block the request process for the entire transport duration, and any network interruption stalls or times out the HTTP request while the transport waits.
> Always offload email delivery to a background queue.

Install `composer require yiisoft/queue` plus exactly **one** transport adapter package: `yiisoft/queue-redis`, `yiisoft/queue-db`, or `yiisoft/queue-amqp`.

### 6.1. Domain Event DTO

```php
<?php

declare(strict_types=1);

namespace App\Domain\User\Event;

final readonly class UserRegisteredEvent
{
    public function __construct(
        public string $userId,
        public string $email,
        public string $name,
    ) {}
}
```

### 6.2. Queue Message DTO

In `yiisoft/queue`, message classes must implement `Yiisoft\Queue\Message\MessageInterface`. Extending `Yiisoft\Queue\Message\Message` gives you `final getMeta()` / `final withMeta()` for free but still requires implementing **`fromPayload()`, `getType()`, AND `getPayload()`** — the abstract base implements none of them, and omitting any one is a PHP fatal error.

The payload contract is strict: only `null`, scalars (`bool`, `int`, `float`, `string`), or arrays of the same types recursively. `fromPayload()` must declare the canonical union signature `fromPayload(string $type, bool|int|float|string|array|null $payload): static`. The interface declares `getPayload(): bool|int|float|string|array|null`; concrete classes may narrow the return type to `array` (as in the example below):

```php
<?php

declare(strict_types=1);

namespace App\Application\Queue\Message;

use InvalidArgumentException;
use Yiisoft\Queue\Message\Message;

final class SendWelcomeEmailMessage extends Message
{
    public const NAME = 'email.welcome';

    public function __construct(
        private readonly string $email,
        private readonly string $name,
    ) {}

    public static function fromPayload(string $type, bool|int|float|string|array|null $payload): static
    {
        if (!is_array($payload) || !isset($payload['email'], $payload['name'])) {
            throw new InvalidArgumentException('Invalid payload for SendWelcomeEmailMessage.');
        }

        return new self(
            email: (string) $payload['email'],
            name: (string) $payload['name'],
        );
    }

    public function getType(): string
    {
        return self::NAME;
    }

    public function getPayload(): array
    {
        return [
            'email' => $this->email,
            'name' => $this->name,
        ];
    }

    public function getEmail(): string
    {
        return $this->email;
    }

    public function getName(): string
    {
        return $this->name;
    }
}
```

### 6.3. PSR-14 Listener Enqueuing Job

```php
<?php

declare(strict_types=1);

namespace App\Application\User\Listener;

use App\Application\Queue\Message\SendWelcomeEmailMessage;
use App\Domain\User\Event\UserRegisteredEvent;
use Yiisoft\Queue\QueueProducerInterface;

final readonly class EnqueueWelcomeEmailListener
{
    public function __construct(
        private QueueProducerInterface $queueProducer,
    ) {}

    public function __invoke(UserRegisteredEvent $event): void
    {
        $this->queueProducer->push(
            new SendWelcomeEmailMessage(
                email: $event->email,
                name: $event->name,
            ),
        );
    }
}
```

`QueueProducerInterface::push(MessageInterface $message): MessageInterface` takes a typed message and returns the (possibly enriched) message representation — it is **not** `void`. The interface also offers `status(string|int $id): MessageStatus` and `getQueueName(): string`.

### 6.4. Queue Consumer Handler

```php
<?php

declare(strict_types=1);

namespace App\Application\Queue\Handler;

use App\Application\Notification\Service\EmailNotificationService;
use Yiisoft\Queue\Message\Handler\HandlerInterface;
use Yiisoft\Queue\Message\MessageInterface;

final readonly class SendWelcomeEmailHandler implements HandlerInterface
{
    public function __construct(
        private EmailNotificationService $notificationService,
    ) {}

    public function handle(MessageInterface $message): void
    {
        $payload = (array) $message->getPayload();

        $this->notificationService->sendWelcomeNotification(
            recipientEmail: (string) ($payload['email'] ?? ''),
            recipientName: (string) ($payload['name'] ?? ''),
        );
    }
}
```

### 6.5. Queue & Event Configuration

#### Queue Message & Handler Registration

Register both the message type and the handler under the `'yiisoft/queue'` params key — **both maps are keyed by the message TYPE string** (the `getType()` value), not the class name:

```php
<?php

declare(strict_types=1);

use App\Application\Queue\Handler\SendWelcomeEmailHandler;
use App\Application\Queue\Message\SendWelcomeEmailMessage;

return [
    'yiisoft/queue' => [
        'messages' => [
            SendWelcomeEmailMessage::NAME => SendWelcomeEmailMessage::class,
        ],
        'handlers' => [
            SendWelcomeEmailMessage::NAME => SendWelcomeEmailHandler::class,
        ],
        'middlewares-push' => [],
        'middlewares-consume' => [],
        'middlewares-fail' => [],
    ],
];
```

Handler values may be a class name implementing `HandlerInterface`, a callable, or any DI definition (`[Class::class, 'method']`). Zero-config shortcut: if the message type equals a `HandlerInterface` FQCN, no `'messages'`/`'handlers'` entries are needed — the resolver falls back to the container. Registering only `'handlers'` still works (handlers fire independently), but the serializer then reconstructs a `GenericMessage` instead of your typed DTO.

#### Producer DI Wiring (Application Decision)

The core `yiisoft/queue` package does **not** bind `QueueProducerInterface` — a constructor-injected producer resolves only after the application wires it. The documented pattern is the `'queues'` role map (only the `producer` and `consumer` keys are valid):

```php
<?php

declare(strict_types=1);

use Yiisoft\Queue\Adapter\AdapterInterface;
use Yiisoft\Queue\AsyncQueueProducer;
use Yiisoft\Queue\QueueConsumer;

return [
    'yiisoft/queue' => [
        'queues' => [
            'yii-queue' => [ // default queue name
                'producer' => [
                    AsyncQueueProducer::class,
                    '__construct()' => ['adapter' => AdapterInterface::class],
                ],
                'consumer' => [
                    QueueConsumer::class,
                    '__construct()' => ['adapter' => AdapterInterface::class],
                ],
            ],
        ],
    ],
];
```

For synchronous in-process processing (development/tests), `Yiisoft\Queue\SyncQueueProducer` executes handlers immediately; its `status()` always reports `MessageStatus::NOT_FOUND`.

#### Running the Worker

The queue package registers three console commands (invoke via the application's `./yii` entry script):

- `yii queue:run [queueName] --limit|-m N` — drains existing messages and exits when done.
- `yii queue:listen [queueName]` — long-running subscribe loop (default queue when the name is omitted).
- `yii queue:listen-all --pause|-p --limit|-m` — subscribes to all queues; development only.

The loop implementation is chosen at DI setup time: `SignalLoop` when `ext-pcntl` is loaded, otherwise `SimpleLoop`.

#### Failure Handling, Retries & Delayed Execution

Without `'middlewares-fail'`, a throwing handler is logged and rethrown as `Yiisoft\Queue\Exception\MessageFailureException` — there are **no automatic retries**. Built-in retry middlewares are configured under the same `'yiisoft/queue'` params key:

```php
<?php

declare(strict_types=1);

use Yiisoft\Queue\Middleware\FailureHandling\FailureMiddlewareDispatcher;
use Yiisoft\Queue\Middleware\FailureHandling\Implementation\ExponentialDelayMiddleware;
use Yiisoft\Queue\Middleware\FailureHandling\Implementation\SendAgainMiddleware;

return [
    'yiisoft/queue' => [
        'middlewares-fail' => [
            FailureMiddlewareDispatcher::DEFAULT_PIPELINE => [
                SendAgainMiddleware::class,
                ExponentialDelayMiddleware::class,
            ],
        ],
    ],
];
```

The `'middlewares-fail'` value feeds `FailureMiddlewareDispatcher::__construct()` directly (`vendor/yiisoft/queue/config/di.php`), so it is a **map of pipeline name → definitions** — a flat class-string list is silently ignored. Per-queue failure pipelines are keyed by queue name (see the [Queue Jobs Guide](infra-queue-jobs.md)).

Handlers must be **idempotent** — for example, the Redis adapter deletes a message only after successful handling.

For delayed execution, wrap the message before pushing: `Yiisoft\Queue\Message\IdEnvelope` adds a `yii-id` meta entry with `getId(): string|int|null`, and `Yiisoft\Queue\Message\DelayEnvelope` (constructor `(MessageInterface $message, float $delaySeconds)`) adds a `yii-delay` meta entry for deferred handling. Message status is the `MessageStatus` int enum: `NOT_FOUND = 0`, `WAITING = 1`, `RESERVED = 2`, `DONE = 3`.

#### PSR-14 Listener Registration

Register the domain event listener in an events file, e.g. `config/common/events.php` — the listener map is **single-nested**:

```php
<?php

declare(strict_types=1);

use App\Application\User\Listener\EnqueueWelcomeEmailListener;
use App\Domain\User\Event\UserRegisteredEvent;

return [
    UserRegisteredEvent::class => [
        EnqueueWelcomeEmailListener::class, // one flat list of listeners per event
    ],
];
```

> [!WARNING]
> Do **not** double-nest the map (`Event::class => [[Listener::class]]`). The inner array is not a valid listener definition; it throws `InvalidListenerConfigurationException` at the first dispatch of that event.

Valid listener definitions per event key: the full six-form table is owned by the [Events & Listeners Guide](core-events-and-listeners.md), section 4.2. The event object is passed as the first argument; additional parameters are DI-resolved at call time; return values are discarded (`: void` is convention). Map keys must reference existing classes.

Wiring steps (the app template ships `'events' => []` and no events file):

1. Create `config/common/events.php` with the single-nested map.
2. Register it in `config/configuration.php`: `'events' => ['common/events.php']`.
3. Run `composer yii-config-rebuild`.
4. Install the dispatcher: `composer require yiisoft/yii-event` — see §7 for what it binds and why mailer events are silently skipped without it.

---

## 7. Mailer Lifecycle Events (`BeforeSend` & `AfterSend`)

`Yiisoft\Mailer\BaseMailer` dispatches two events through its optional constructor dependency `Psr\EventDispatcher\EventDispatcherInterface`:
1. `Yiisoft\Mailer\Event\BeforeSend`: dispatched prior to transport delivery. Setting `$event->preventSendingMessage = true;` cancels transmission immediately.
2. `Yiisoft\Mailer\Event\AfterSend`: dispatched right after successful delivery (never when `sendMessage()` throws).

The `BaseMailer::send()` pipeline: apply `MessageSettings` defaults → dispatch `BeforeSend` → check `$event->preventSendingMessage` → `sendMessage()` → dispatch `AfterSend`. Cancellation is an explicit `BaseMailer` check after dispatch — `BeforeSend` is a plain final class, not a `StoppableEventInterface`.

> [!IMPORTANT]
> **The dispatcher dependency is nullable.** `yiisoft/mailer-symfony` binds `TransportInterface` and `MailerInterface` but **not** `EventDispatcherInterface`. Without a bound dispatcher the events are silently skipped and mail still sends — your suppression and audit listeners never run, with no error. Install the wiring package: `composer require yiisoft/yii-event` (auto-binds `EventDispatcherInterface::class => Dispatcher::class` and `ListenerProviderInterface::class => Provider::class`).

### 7.1. Suppressing Delivery via `BeforeSend`

```php
<?php

declare(strict_types=1);

namespace App\Application\Notification\Listener;

use Psr\Log\LoggerInterface;
use Yiisoft\Mailer\Event\BeforeSend;

final readonly class SuppressBlacklistedRecipientsListener
{
    public function __construct(
        private LoggerInterface $logger,
    ) {}

    public function __invoke(BeforeSend $event): void
    {
        $to = (array) $event->message->getTo();

        foreach ($to as $address => $name) {
            $email = is_string($address) ? $address : (string) $name;

            if (str_ends_with(strtolower($email), '@dispostable.com')) {
                // Cancel sending for disposable/blacklisted domains
                $event->preventSendingMessage = true;

                $this->logger->warning('Suppressed email delivery to blacklisted domain: {email}', [
                    'email' => $email,
                ]);
                return;
            }
        }
    }
}
```

### 7.2. Audit Logging via `AfterSend`

```php
<?php

declare(strict_types=1);

namespace App\Application\Notification\Listener;

use Psr\Log\LoggerInterface;
use Yiisoft\Mailer\Event\AfterSend;

final readonly class EmailAuditLogListener
{
    public function __construct(
        private LoggerInterface $logger,
    ) {}

    public function __invoke(AfterSend $event): void
    {
        $this->logger->info('Email dispatched successfully: "{subject}" to {to}', [
            'subject' => $event->message->getSubject(),
            'to' => json_encode($event->message->getTo()),
        ]);
    }
}
```

Wiring in `config/common/events.php`:

```php
<?php

declare(strict_types=1);

use App\Application\Notification\Listener\EmailAuditLogListener;
use App\Application\Notification\Listener\SuppressBlacklistedRecipientsListener;
use Yiisoft\Mailer\Event\AfterSend;
use Yiisoft\Mailer\Event\BeforeSend;

return [
    BeforeSend::class => [
        SuppressBlacklistedRecipientsListener::class,
    ],
    AfterSend::class => [
        EmailAuditLogListener::class,
    ],
];
```

Register the file as described in §6.5 (create `config/common/events.php`, add `'events' => ['common/events.php']` to `config/configuration.php`, run `composer yii-config-rebuild`, and install `yiisoft/yii-event`). Map keys must reference existing classes — `BeforeSend` and `AfterSend` are final classes with no marker interfaces to register against.

Development validation: run `Yiisoft\Yii\Event\ListenerConfigurationChecker::check($config->get('events-web'))` — it eagerly resolves every listener definition and catches bad format, non-existent event classes, and non-callable listeners (dev/test only; mechanics in the [Events & Listeners Guide](core-events-and-listeners.md), section 4.3).

To deliver application log records by email through the same `MailerInterface`, `yiisoft/log-target-email` provides `EmailTarget` (constructor `(MailerInterface $mailer, array|string $emailTo, string $subjectEmail = '', array $levels = [])`; default subject `'Application Log'`; it sends a `Message` with a word-wrapped plain-text body).

---

## 8. Testing Recipes (`StubMailer`)

Yii3 provides `Yiisoft\Mailer\StubMailer` out of the box. It implements `MailerInterface`, collects all dispatched messages in an internal list, and makes them accessible via `getMessages(): array` (`list<MessageInterface>` in send order). It has **no constructor** — instantiate with `new StubMailer()`. Its `sendMultiple()` appends every message and reports all of them as successful:

```php
<?php

declare(strict_types=1);

namespace App\Tests\Unit\Notification;

use App\Application\Notification\Service\EmailNotificationService;
use PHPUnit\Framework\TestCase;
use Yiisoft\Mailer\Message;
use Yiisoft\Mailer\MessageInterface;
use Yiisoft\Mailer\StubMailer;

final class EmailNotificationServiceTest extends TestCase
{
    public function testWelcomeNotificationIsSent(): void
    {
        $stubMailer = new StubMailer();
        $service = new EmailNotificationService($stubMailer);

        $service->sendWelcomeNotification(
            recipientEmail: 'alice@example.com',
            recipientName: 'Alice',
        );

        $sentMessages = $stubMailer->getMessages();
        $this->assertCount(1, $sentMessages);

        /** @var MessageInterface $sentMessage */
        $sentMessage = $sentMessages[0];
        $this->assertSame(['alice@example.com' => 'Alice'], $sentMessage->getTo());
        $this->assertSame('Welcome to Our Service', $sentMessage->getSubject());
        $this->assertStringContainsString('Thank you for signing up!', (string) $sentMessage->getTextBody());
    }

    public function testBatchSendReportsAllMessagesAsSuccess(): void
    {
        $stubMailer = new StubMailer();
        $messages = [
            (new Message())->withTo('a@example.com')->withSubject('Digest A')->withTextBody('Hello A'),
            (new Message())->withTo('b@example.com')->withSubject('Digest B')->withTextBody('Hello B'),
        ];

        $results = $stubMailer->sendMultiple($messages);

        $this->assertCount(2, $results->successMessages);
        $this->assertSame([], $results->failMessages);
    }
}
```

#### Asserting Lifecycle Events with `SimpleEventDispatcher`

`Yiisoft\Test\Support\EventDispatcher\SimpleEventDispatcher` (constructor `(Closure ...$listeners)`) implements `EventDispatcherInterface` and records dispatched events: `getEvents(): array`, `getEventClasses(): array`, `isClassTriggered(string $class, ?int $times = null): bool`, and `clearEvents()`. This is the pattern the mailer package's own tests use for `BeforeSend` prevention:

```php
<?php

declare(strict_types=1);

namespace App\Tests\Integration\Notification;

use PHPUnit\Framework\TestCase;
use Yiisoft\Mailer\Event\AfterSend;
use Yiisoft\Mailer\Event\BeforeSend;
use Yiisoft\Mailer\FileMailer;
use Yiisoft\Mailer\Message;
use Yiisoft\Test\Support\EventDispatcher\SimpleEventDispatcher;

final class MailerEventTest extends TestCase
{
    public function testBeforeSendAndAfterSendAreDispatched(): void
    {
        $eventDispatcher = new SimpleEventDispatcher();
        $mailer = new FileMailer(
            path: sys_get_temp_dir() . '/mailer-guide-test',
            eventDispatcher: $eventDispatcher,
        );

        $mailer->send(
            (new Message())->withTo('alice@example.com')->withSubject('Test')->withTextBody('Hello'),
        );

        $this->assertTrue($eventDispatcher->isClassTriggered(BeforeSend::class));
        $this->assertTrue($eventDispatcher->isClassTriggered(AfterSend::class));
        $this->assertInstanceOf(BeforeSend::class, $eventDispatcher->getEvents()[0]);
    }
}
```

`yiisoft/test-support` ships PSR doubles for Clock, Container, EventDispatcher, HttpMessage, Log, and SimpleCache — there is **no** mailer double; `StubMailer` comes from `yiisoft/mailer` itself. For logging assertions, `Yiisoft\Test\Support\Log\SimpleLogger` implements `LoggerInterface` via `LoggerTrait` and exposes `getMessages(): array`.

---

## 9. Anti-Pattern Matrix

| Forbidden Anti-Pattern | Why it breaks Yii3 | Idiomatic Yii3 Solution |
|---|---|---|
| `Yii::$app->mailer->compose(...)` or `Yii::$app->mailer->send(...)` | Static service locators and `Yii::$app` do not exist in Yii3. | Inject `Yiisoft\Mailer\MailerInterface` via constructor and instantiate `new Yiisoft\Mailer\Message()`. |
| Calling `$results->getErrors()` on `SendResults` | Phantom method; `SendResults` has no `getErrors()` method and throws an `Error: Call to undefined method`. | Inspect the public property `$results->failMessages`, which is an array of `['message' => MessageInterface, 'error' => \Throwable]`. |
| Passing `WebViewRenderer::renderPartial()` or `ViewRenderer::renderPartial()` to `withHtmlBody()` | `renderPartial()` returns a PSR-7 response object — an `@internal` `ViewResponse` from `WebViewRenderer`, or the deprecated `DataResponse` from the deprecated `ViewRenderer` — causing a Fatal `TypeError` when passed to `withHtmlBody(?string $html)`. | Use `Yiisoft\View\ViewInterface::render()` to return a `string`, or call `WebViewRenderer::renderPartialAsString()`. |
| Mutating `$message` without capturing return value (`$message->withTo('...')`) | `Message` is an immutable value object. Calling `with*()` returns a cloned instance; dropping the assignment silently discards modifications. | Reassign the returned instance: `$message = $message->withTo('user@domain.com');`. |
| Synchronous SMTP delivery inside HTTP action controllers | The SMTP handshake, TLS negotiation, and network roundtrips block the request process for the entire transport duration; network interruptions stall the HTTP request until it times out. | Dispatch a PSR-14 domain event and offload transmission to a background job in `yiisoft/queue`. |
| Passing unpacked arrays directly to `withAttachments()` or `withEmbeddings()` | Methods accept variadic arguments: `File ...$files`. Passing a single array without the splat operator (`...`) causes a `TypeError`. | Use unpacking: `$message->withAttachments(...$attachments);` or pass arguments individually: `withAttachments($file1, $file2);`. |
| Implementing a queue message without `fromPayload()` / `getType()` / `getPayload()`, or declaring `fromPayload(string $type, mixed $payload)` | Extending `Yiisoft\Queue\Message\Message` covers only `getMeta()`/`withMeta()` (both final); the abstract base implements none of `fromPayload()`, `getType()`, `getPayload()` — omitting any one is a PHP fatal error. The canonical `fromPayload()` signature is the union form; `mixed` widening is legal but non-canonical. | Extend `Yiisoft\Queue\Message\Message` and implement `fromPayload(string $type, bool|int|float|string|array|null $payload): static`, `getType(): string`, and `getPayload(): bool|int|float|string|array|null` (narrowing to `array` is allowed). |
| Storing objects in queue message payloads | The `MessageInterface` payload contract allows only `null`, scalars, and arrays of the same types recursively; the default `JsonMessageEncoder` fails at push time with `MessageSerializerException` (`json_encode` with `JSON_THROW_ON_ERROR`). | Store only scalar identifiers (`string`, `int`) in message payloads and re-query required entities in the queue handler. |
| Defining a double-nested listener map (`Event::class => [[Listener::class]]`) | Each inner element of the map must be ONE listener definition; a nested array is not callable and throws `InvalidListenerConfigurationException` at the first dispatch of that event. | Use single nesting: `Event::class => [Listener::class, ...]`. |
| Repeating `withHeader()` expecting header values to accumulate | `withHeader()` replaces all values stored under the given name on every call. | Append values with `withAddedHeader(string $name, string $value)`; bulk-set with `withHeaders(?array)`. |
| Relying on lifecycle events without binding `EventDispatcherInterface` | `BaseMailer`'s dispatcher dependency is nullable; without a binding the events are silently skipped — suppression and audit listeners never run, with no error. | Install `yiisoft/yii-event` (auto-binds the PSR-14 interfaces) and register listeners in the events config group (see §6.5 / §7). |
| Neglecting HTML escaping in email view templates | Unescaped user-supplied input renders unescaped HTML, exposing email clients to layout breakage and script/phishing injection. | Always wrap dynamic user data with `Yiisoft\Html\Html::encode($content)` in view templates; use `Html::encodeAttribute()` for HTML attribute values. |
| Hardcoding absolute mail spool paths for `FileMailer` | Hardcoded filesystem paths break portability across local environments, Docker containers, and CI. | Resolve paths via `Yiisoft\Aliases\Aliases::get('@runtime/mail')` or configure `'yiisoft/mailer' => ['fileMailer' => ['path' => '@runtime/mail']]`. |
| Omitting message type mapping in `'yiisoft/queue'['messages']` | If only `'handlers'` is registered without `'messages'`, `MessageSerializer` reconstructs `GenericMessage` instead of your typed DTO. | Register both `'messages' => [MyMessage::NAME => MyMessage::class]` and `'handlers' => [MyMessage::NAME => MyHandler::class]`. |
