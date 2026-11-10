# Yii3 Mailer & Email Notifications Guide

> [!IMPORTANT]
> **Grounding rule:** sources of truth are split by question type — API: installed `vendor/yiisoft/<pkg>/src/` (versions via `composer.lock`); implementation patterns: this guide; project conventions: the project's architecture artifact or dominant `src/` style. Full table and conflict rule: SKILL.md Core rule 2.

> Practical guide and configuration recipes for composing, rendering HTML templates, attaching files, embedding inline assets, and sending emails via `yiisoft/mailer` and `yiisoft/mailer-symfony`. Production transport DSN configuration, asynchronous queue delivery, and mailer lifecycle events live in dedicated child guides.

---

## Table of Contents
- [1. Mailer Architecture & Contracts](#1-mailer-architecture--contracts)
- [2. Transport & DSN Configuration](#2-transport--dsn-configuration)
  - [2.1. Production SMTP Configuration (yiisoft/mailer-symfony)](#21-production-smtp-configuration-yiisoftmailer-symfony) — full reference in the [Mailer Transports & DSN Guide](infra-mailer-transports.md)
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
- [6. Asynchronous Background Sending via Queue & PSR-14](#6-asynchronous-background-sending-via-queue--psr-14) — full reference in the [Mailer Async Sending & Lifecycle Events Guide](infra-mailer-async-queue.md)
- [7. Mailer Lifecycle Events (BeforeSend & AfterSend)](#7-mailer-lifecycle-events-beforesend--aftersend) — full reference in the [Mailer Async Sending & Lifecycle Events Guide](infra-mailer-async-queue.md)
- [8. Testing Recipes (StubMailer)](#8-testing-recipes-stubmailer)
- [9. Anti-Pattern Matrix](#9-anti-pattern-matrix)
- [Related Topic Guides](#related-topic-guides)

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

> **For the complete reference on production transport & DSN configuration** — the `'yiisoft/mailer-symfony'` params block, ESMTP transport DSN assembly, the `useSendmail` switch, and the full `messageSettings` defaults map — **see the** [Mailer Transports & DSN Guide, §1–§2](infra-mailer-transports.md#1-transport-configuration-usesendmail-esmtptransport).

Transport selection is an application decision resolved from what is actually installed: `yiisoft/mailer` alone provides the core contracts plus the development/testing mailers (§2.2); production SMTP delivery additionally requires the `yiisoft/mailer-symfony` bridge — the only transport adapter in the `mail` family ([package-catalog.md, §3 "Pick Exactly ONE per Family"](package-catalog.md#3-driver--storage-selection-rules-pick-exactly-one-per-family)). When the bridge is installed, its config plugin auto-registers `MailerInterface::class => Yiisoft\Mailer\Symfony\Mailer::class` and the `TransportInterface` definition; it does **not** bind `Psr\EventDispatcher\EventDispatcherInterface` — lifecycle events live in the [Mailer Async Sending & Lifecycle Events Guide](infra-mailer-async-queue.md), §7.

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
- `sendMessage()` writes `(string) $message` to `<path>/<filename>`, creating the directory recursively (`mkdir(..., 0777, true)`). The default filename is a timestamped `.eml` name (date prefix + epoch-seconds + random suffix — no microseconds: `microtime(true)` is cast to `int`); `$filenameCallback` (`fn(MessageInterface $message): string`) overrides it — a non-string return throws `LogicException('Filename must be a string. "%s" received.')`.
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

> **For the complete reference on asynchronous queue sending** — the domain event DTO, queue message DTO, PSR-14 listener enqueuing the job, queue consumer handler, and the full queue/event configuration — **see the** [Mailer Async Sending & Lifecycle Events Guide, §1–§6](infra-mailer-async-queue.md#1-when-async-sending-applies-performance-rule).

Plain synchronous sending (§3) remains the default path. Trap: never send emails synchronously inside an HTTP action — the SMTP handshake, TLS negotiation, and network roundtrips block the request process for the entire transport duration; offload delivery to a background queue when latency matters.

---

## 7. Mailer Lifecycle Events (`BeforeSend` & `AfterSend`)

> **For the complete reference on mailer lifecycle events** — `BeforeSend` delivery suppression, `AfterSend` audit logging, event wiring in the events config group, and dispatcher validation — **see the** [Mailer Async Sending & Lifecycle Events Guide, §7](infra-mailer-async-queue.md#7-mailer-lifecycle-events-beforesend--aftersend).

Trap (applies to synchronous sends too): `BaseMailer`'s `Psr\EventDispatcher\EventDispatcherInterface` constructor dependency is nullable, and `yiisoft/mailer-symfony` does not bind it — without a bound dispatcher the `BeforeSend`/`AfterSend` events are silently skipped and mail still sends, with no error. Install `yiisoft/yii-event`.

---

## 8. Testing Recipes (`StubMailer`)

`Yiisoft\Mailer\StubMailer` (introduced in §2.2) implements `MailerInterface`, has **no constructor** — instantiate with `new StubMailer()` — collects all dispatched messages in an internal list, and exposes them via `getMessages(): array` (`list<MessageInterface>` in send order). One compact zero-shot test:

```php
// App\Tests\Unit\Notification\EmailNotificationServiceTest
public function testWelcomeNotificationIsSent(): void
{
    $stubMailer = new StubMailer();
    $service = new EmailNotificationService($stubMailer);

    $service->sendWelcomeNotification(recipientEmail: 'alice@example.com', recipientName: 'Alice');

    $sentMessages = $stubMailer->getMessages();
    $this->assertCount(1, $sentMessages);
    $this->assertSame(['alice@example.com' => 'Alice'], $sentMessages[0]->getTo());
    $this->assertSame('Welcome to Our Service', $sentMessages[0]->getSubject());
    $this->assertStringContainsString('Thank you for signing up!', (string) $sentMessages[0]->getTextBody());
}
```

- Batch semantics: `sendMultiple()` appends every message to the same internal list and reports all of them as successful — the returned `SendResults` DTO lists them in `$successMessages` with an empty `$failMessages` (full failure semantics live in §3.2; the `$results->getErrors()` phantom-method trap lives in the §9 anti-pattern matrix).

To assert lifecycle events (owned by the [Mailer Async Sending & Lifecycle Events Guide, §7](infra-mailer-async-queue.md#7-mailer-lifecycle-events-beforesend--aftersend)), inject a `Yiisoft\Test\Support\EventDispatcher\SimpleEventDispatcher` into the mailer, `send()` one message, and assert `isClassTriggered(BeforeSend::class)` / `isClassTriggered(AfterSend::class)` — no separate mailer double ships in `yiisoft/test-support`; `StubMailer` comes from `yiisoft/mailer` itself.

> [!TIP]
> **Mailer Testing Reference:**
> For the complete reference on the PSR-14 event double used to assert `BeforeSend`/`AfterSend` dispatching, see the [Testing PSR Doubles Guide, §2. PSR-14 Event Dispatcher (`SimpleEventDispatcher`)](testing-psr-doubles.md#2-psr-14-event-dispatcher-simpleeventdispatcher). For logging assertions with `Yiisoft\Test\Support\Log\SimpleLogger` (`LoggerInterface` via `LoggerTrait`, `getMessages(): array`), see [§3. PSR-3 Logger (`SimpleLogger`)](testing-psr-doubles.md#3-psr-3-logger-simplelogger).

---

## 9. Anti-Pattern Matrix

| Forbidden Anti-Pattern | Why it breaks Yii3 | Idiomatic Yii3 Solution |
|---|---|---|
| `Yii::$app->mailer->compose(...)` or `Yii::$app->mailer->send(...)` | Static service locators and `Yii::$app` do not exist in Yii3. | Inject `Yiisoft\Mailer\MailerInterface` via constructor and instantiate `new Yiisoft\Mailer\Message()`. |
| Calling `$results->getErrors()` on `SendResults` | Phantom method; `SendResults` has no `getErrors()` method and throws an `Error: Call to undefined method`. | Inspect the public property `$results->failMessages`, which is an array of `['message' => MessageInterface, 'error' => \Throwable]`. |
| Passing `WebViewRenderer::renderPartial()` or `ViewRenderer::renderPartial()` to `withHtmlBody()` | `renderPartial()` returns a PSR-7 response object — an `@internal` `ViewResponse` from `WebViewRenderer`, or the deprecated `DataResponse` from the deprecated `ViewRenderer` — causing a Fatal `TypeError` when passed to `withHtmlBody(?string $html)`. | Use `Yiisoft\View\ViewInterface::render()` to return a `string`, or call `WebViewRenderer::renderPartialAsString()`. |
| Mutating `$message` without capturing return value (`$message->withTo('...')`) | `Message` is an immutable value object. Calling `with*()` returns a cloned instance; dropping the assignment silently discards modifications. | Reassign the returned instance: `$message = $message->withTo('user@domain.com');`. |
| Passing unpacked arrays directly to `withAttachments()` or `withEmbeddings()` | Methods accept variadic arguments: `File ...$files`. Passing a single array without the splat operator (`...`) causes a `TypeError`. | Use unpacking: `$message->withAttachments(...$attachments);` or pass arguments individually: `withAttachments($file1, $file2);`. |
| Repeating `withHeader()` expecting header values to accumulate | `withHeader()` replaces all values stored under the given name on every call. | Append values with `withAddedHeader(string $name, string $value)`; bulk-set with `withHeaders(?array)`. |
| Neglecting HTML escaping in email view templates | Unescaped user-supplied input renders unescaped HTML, exposing email clients to layout breakage and script/phishing injection. | Always wrap dynamic user data with `Yiisoft\Html\Html::encode($content)` in view templates; use `Html::encodeAttribute()` for HTML attribute values. |
| Hardcoding absolute mail spool paths for `FileMailer` | Hardcoded filesystem paths break portability across local environments, Docker containers, and CI. | Resolve paths via `Yiisoft\Aliases\Aliases::get('@runtime/mail')` or configure `'yiisoft/mailer' => ['fileMailer' => ['path' => '@runtime/mail']]`. |

Queue-based sending and lifecycle-event anti-patterns (synchronous SMTP in HTTP actions, queue message contract violations, double-nested listener maps, unbound event dispatchers) are owned by the [Mailer Async Sending & Lifecycle Events Guide, §8](infra-mailer-async-queue.md#8-anti-pattern-matrix).

---

## Related Topic Guides

- [Mailer Transports & DSN Guide](infra-mailer-transports.md) — Production SMTP configuration: the `esmtpTransport` DSN assembly, the `useSendmail` switch, and the full `messageSettings` defaults map.
- [Mailer Async Sending & Lifecycle Events Guide](infra-mailer-async-queue.md) — Optional queue-based background delivery (§1–§6) and `BeforeSend`/`AfterSend` lifecycle events (§7).
- [Queue & Asynchronous Jobs Guide](infra-queue-jobs.md) — Queue adapters, middlewares, message contracts, and worker lifecycle in depth.
- [Events & Listeners Guide](core-events-and-listeners.md) — PSR-14 listener registration, config groups, and `yiisoft/yii-event` wiring.
- [Logging Guide](infra-logging.md) — `EmailTarget` for delivering log records by email through the mailer.
- [Testing Core Guide](testing-core.md) — `SimpleEventDispatcher` and `SimpleLogger` test doubles used in mailer assertions.
- [DI & Configuration Guide](core-di-and-config.md) — Config groups, params merging, and DI definition overrides referenced throughout this guide.
