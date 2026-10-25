# Yii3 Mailer & Email Notifications Guide

> Practical guide and configuration recipes for composing, rendering HTML templates, attaching files, embedding inline assets, and sending emails via `yiisoft/mailer` and `yiisoft/mailer-symfony`.
>
> **Source of Truth & Verification Rule for AI Models:**
> In projects using this extension, always verify exact method signatures, constructor arguments, and options directly in `vendor/yiisoft/<package>/src/` for installed packages.
> When generating code, if an installed package's method signature or property is unfamiliar or in doubt, **read its source files in `vendor/yiisoft/<package>/src/`** rather than guessing or relying on Yii2 habits.

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
| **`MailerInterface`** | `Yiisoft\Mailer\MailerInterface` | High-level contract for sending messages (`send()` and `sendMultiple()`). |
| **`MessageInterface`** | `Yiisoft\Mailer\MessageInterface` | Immutable contract for message metadata (recipients, subject, charset, dates, headers). |
| **`Message`** | `Yiisoft\Mailer\Message` | Concrete immutable message implementation with fluent `with*()` methods. |
| **`File`** | `Yiisoft\Mailer\File` | Value object for file attachments and embedded inline media. |
| **`SendResults`** | `Yiisoft\Mailer\SendResults` | DTO returned by `sendMultiple()` containing public `$successMessages` and `$failMessages`. |
| **`Priority`** | `Yiisoft\Mailer\Priority` | Backed integer enum (`HIGHEST = 1`, `HIGH = 2`, `NORMAL = 3`, `LOW = 4`, `LOWEST = 5`) for email priority. |
| **`Symfony\Mailer`** | `Yiisoft\Mailer\Symfony\Mailer` | Official bridge adapter executing sends over `symfony/mailer` transport. |
| **`FileMailer`** | `Yiisoft\Mailer\FileMailer` | Development mailer writing `.eml` files to disk without external network calls. |
| **`StubMailer`** | `Yiisoft\Mailer\StubMailer` | In-memory testing mailer storing sent messages for unit test assertions (`getMessages()`). |
| **`NullMailer`** | `Yiisoft\Mailer\NullMailer` | Discarding mailer silently dropping all messages (for benchmarks or disabled mailing). |
| **`BeforeSend`** | `Yiisoft\Mailer\Event\BeforeSend` | PSR-14 event dispatched before message delivery; can cancel delivery via `$preventSendingMessage`. |
| **`AfterSend`** | `Yiisoft\Mailer\Event\AfterSend` | PSR-14 event dispatched immediately after successful message delivery. |

---

## 2. Transport & DSN Configuration

### 2.1. Production SMTP Configuration (`yiisoft/mailer-symfony`)

`yiisoft/mailer-symfony` wraps Symfony Mailer transports. The transport DSN and global message defaults are configured in `config/common/params.php`:

```php
<?php

declare(strict_types=1);

return [
    'yiisoft/mailer-symfony' => [
        'useSendmail' => false,
        'esmtpTransport' => [
            'scheme' => 'smtps', // "smtps" for SSL/TLS (port 465), or "smtp" for STARTTLS (port 587)
            'host' => 'smtp.example.com',
            'port' => 465,
            'username' => 'apikey',
            'password' => 'secret-smtp-password',
            'options' => [], // Options for stream context (e.g. SSL verification settings)
        ],
        'messageSettings' => [
            'charset' => 'UTF-8',
            'from' => ['no-reply@example.com' => 'My Application'],
            'convertHtmlToText' => true, // Automatically converts HTML body to plain text if text body is omitted
        ],
    ],
];
```

The DI binding `Yiisoft\Mailer\MailerInterface => Yiisoft\Mailer\Symfony\Mailer` is registered automatically by `yiisoft/mailer-symfony` via its package `config/di.php`.

### 2.2. Development & Testing Mailers (`FileMailer`, `StubMailer`, `NullMailer`)

#### Local Development with `FileMailer`
For local development where you want to inspect `.eml` files in your runtime directory without sending real emails, configure the path in `config/environments/dev/params.php` and bind `FileMailer` in `config/environments/dev/di.php`:

In `config/environments/dev/params.php`:
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

In `config/environments/dev/di.php`:
```php
<?php

declare(strict_types=1);

use Yiisoft\Mailer\FileMailer;
use Yiisoft\Mailer\MailerInterface;

return [
    MailerInterface::class => FileMailer::class,
];
```

#### Automated Testing with `StubMailer`
In automated integration and unit test environments, bind `StubMailer` in `config/environments/test/di.php` so all emails are kept in memory:

```php
<?php

declare(strict_types=1);

use Yiisoft\Mailer\MailerInterface;
use Yiisoft\Mailer\StubMailer;

return [
    MailerInterface::class => StubMailer::class,
];
```

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

### 3.2. Batch Sending with `sendMultiple()` and `SendResults`

When dispatching distinct messages in batch, use `MailerInterface::sendMultiple()`. The method returns a `Yiisoft\Mailer\SendResults` object containing public properties:
- `public readonly array $successMessages`: `list<MessageInterface>` of messages sent successfully.
- `public readonly array $failMessages`: `list<array{message: MessageInterface, error: \Throwable}>` of messages that failed to send.

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
            ->withHeader('X-Event-Source-IP', $ipAddress)
            ->withTextBody("A new login was recorded from IP {$ipAddress}. If this was not you, lock your account immediately.");

        $this->mailer->send($message);
    }
}
```

---

## 4. HTML Templating & View Rendering

Emails should be formatted using reusable PHP view templates instead of large string concatenations.

> [!IMPORTANT]
> **View Rendering Return Types:**
> - When using `Yiisoft\View\ViewInterface`, calling `render(string $view, array $parameters = []): string` returns the rendered HTML `string` directly. This is the **recommended** approach for domain services and queue workers.
> - When using `Yiisoft\Yii\View\Renderer\WebViewRenderer`, you **must** call `renderPartialAsString(string $name, array $parameters = []): string`. Calling `renderPartial()` returns a PSR-7 `ResponseInterface` / `DataResponse`, which will cause a `TypeError` if passed into `$message->withHtmlBody()`.

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
        // Renders template file from configured view path, e.g. views/email/order-confirmation.php
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

If your service is wired to `Yiisoft\Yii\View\Renderer\WebViewRenderer`, explicitly use `renderPartialAsString()`:

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

### 4.3. Email View Template with HTML Escaping

Template located at `views/email/order-confirmation.php`:

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

---

## 5. File Attachments & Inline Embeddings

`Yiisoft\Mailer\File` encapsulates both regular file attachments and inline media.
- Factory method `File::fromPath(string $path, ?string $name = null, ?string $contentType = null): self`
- Factory method `File::fromContent(string $content, ?string $name = null, ?string $contentType = null): self`
- Method `id(): string` returns unique Content-ID.
- Method `cid(): string` returns `"cid:{$this->id()}"` for referencing inline in HTML.

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
            ->withEmbeddings($logo) // Embeddings are marked inline by Symfony Mailer bridge
            ->withHtmlBody($html);

        $this->mailer->send($message);
    }
}
```

---

## 6. Asynchronous Background Sending via Queue & PSR-14

> [!IMPORTANT]
> **Performance Rule:** Never send emails synchronously inside an HTTP request action. External SMTP handshake and TLS latency will block client response times (300–3000ms) and cause HTTP timeout errors on network interruptions.
> Always offload email delivery to a background queue using PSR-14 domain events.

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

In `yiisoft/queue`, message classes must implement `Yiisoft\Queue\Message\MessageInterface`. Extending `Yiisoft\Queue\Message\Message` provides standard metadata handling (`getMeta()`, `withMeta()`) and requires implementing `fromPayload()` and `getType()`:

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

Register the domain event listener in `config/common/events.php`:

```php
<?php

declare(strict_types=1);

use App\Application\User\Listener\EnqueueWelcomeEmailListener;
use App\Domain\User\Event\UserRegisteredEvent;

return [
    UserRegisteredEvent::class => [
        [EnqueueWelcomeEmailListener::class],
    ],
];
```

Register both the message type and handler in `config/common/params.php`:

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
    ],
];
```

---

## 7. Mailer Lifecycle Events (`BeforeSend` & `AfterSend`)

`Yiisoft\Mailer\BaseMailer` dispatches two PSR-14 events through `Psr\EventDispatcher\EventDispatcherInterface`:
1. `Yiisoft\Mailer\Event\BeforeSend`: dispatched prior to transport delivery. Setting `$event->preventSendingMessage = true;` cancels transmission immediately.
2. `Yiisoft\Mailer\Event\AfterSend`: dispatched right after successful delivery.

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
        [SuppressBlacklistedRecipientsListener::class],
    ],
    AfterSend::class => [
        [EmailAuditLogListener::class],
    ],
];
```

---

## 8. Testing Recipes (`StubMailer`)

Yii3 provides `Yiisoft\Mailer\StubMailer` out of the box. It implements `MailerInterface`, collects all dispatched messages in an internal array, and makes them accessible via `getMessages()`:

```php
<?php

declare(strict_types=1);

namespace App\Tests\Unit\Notification;

use App\Application\Notification\Service\EmailNotificationService;
use PHPUnit\Framework\TestCase;
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
}
```

---

## 9. Anti-Pattern Matrix

| Forbidden Anti-Pattern | Why it breaks Yii3 | Idiomatic Yii3 Solution |
|---|---|---|
| `Yii::$app->mailer->compose(...)` or `Yii::$app->mailer->send(...)` | Static service locators and `Yii::$app` do not exist in Yii3. | Inject `Yiisoft\Mailer\MailerInterface` via constructor and instantiate `new Yiisoft\Mailer\Message()`. |
| Calling `$results->getErrors()` on `SendResults` | Phantom method; `SendResults` has no `getErrors()` method and throws an `Error: Call to undefined method`. | Inspect the public property `$results->failMessages`, which is an array of `['message' => MessageInterface, 'error' => \Throwable]`. |
| Passing `WebViewRenderer::renderPartial()` or `ViewRenderer::renderPartial()` to `withHtmlBody()` | `renderPartial()` returns a PSR-7 `ResponseInterface` / `DataResponse`, causing a Fatal `TypeError` when passed to `withHtmlBody(?string $html)`. | Use `Yiisoft\View\ViewInterface::render()` to return a `string`, or call `WebViewRenderer::renderPartialAsString()`. |
| Mutating `$message` without capturing return value (`$message->withTo('...')`) | `Message` is an immutable value object. Calling `with*()` returns a cloned instance; dropping the assignment silently discards modifications. | Reassign the returned instance: `$message = $message->withTo('user@domain.com');`. |
| Synchronous SMTP delivery inside HTTP action controllers | Network roundtrips, DNS lookups, and SMTP handshakes add 300–3000ms latency, causing gateway timeouts and thread blocking. | Dispatch a PSR-14 domain event and offload transmission to a background job in `yiisoft/queue`. |
| Passing unpacked arrays directly to `withAttachments()` or `withEmbeddings()` | Methods accept variadic arguments: `File ...$files`. Passing a single array without the splat operator (`...`) causes a `TypeError`. | Use unpacking: `$message->withAttachments(...$attachments);` or pass arguments individually: `withAttachments($file1, $file2);`. |
| Implementing `MessageInterface` in Queue DTOs without `fromPayload()` or extending `Message` | Missing `fromPayload()` or `withMeta()` causes a PHP Fatal Error because interface contracts are violated. | Extend `Yiisoft\Queue\Message\Message` (which implements `getMeta()` and `withMeta()`) and implement `fromPayload(string $type, mixed $payload): static`. |
| Storing non-scalar objects or active entities in Queue message payloads | Standard queue serializers (`JsonSerializer`) cannot serialize PDO database connections or complex object trees. | Store only scalar identifiers (`string`, `int`) in message payloads and re-query required entities in the queue handler. |
| Neglecting HTML escaping in email view templates | Unescaped user-supplied input renders unescaped HTML, exposing email clients to layout breakage and script/phishing injection. | Always wrap dynamic user data with `Yiisoft\Html\Html::encode($value)` in view templates. |
| Hardcoding absolute mail spool paths for `FileMailer` | Hardcoded filesystem paths break portability across local environments, Docker containers, and CI. | Resolve paths via `Yiisoft\Aliases\Aliases::get('@runtime/mail')` or configure `'yiisoft/mailer' => ['fileMailer' => ['path' => '@runtime/mail']]`. |
| Omitting message type mapping in `'yiisoft/queue'['messages']` | If only `'handlers'` is registered without `'messages'`, `MessageSerializer` reconstructs `GenericMessage` instead of your typed DTO. | Register both `'messages' => [MyMessage::NAME => MyMessage::class]` and `'handlers' => [MyMessage::NAME => MyHandler::class]`. |
