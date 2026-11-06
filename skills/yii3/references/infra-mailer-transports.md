# Yii3 Mailer Transports & DSN Configuration Guide

> [!IMPORTANT]
> **Grounding rule:** sources of truth are split by question type — API: installed `vendor/yiisoft/<pkg>/src/` (versions via `composer.lock`); implementation patterns: this guide; project conventions: the project's architecture artifact or dominant `src/` style. Full table and conflict rule: SKILL.md Core rule 2.

> Production transport configuration for the `yiisoft/mailer-symfony` bridge: the `'yiisoft/mailer-symfony'` params block with the `esmtpTransport` DSN assembly rules and the `useSendmail` switch, plus the full `messageSettings` defaults map applied by `BaseMailer` at send time.

**Scope & Ownership.** This guide is the single source of truth for production transport and message-default configuration of the `mail` package family. The mailer core contracts (`MailerInterface`, `Message`, `BaseMailer`) and the development/testing mailers (`FileMailer`, `StubMailer`, `NullMailer`) are owned by the [Mailer & Email Notifications Guide](infra-mailer.md). Which mailer/transport package is installed is an application decision — resolve it via the project's `composer.json` (`yiisoft/mailer` core alone suffices for development and tests; production SMTP delivery additionally requires the `yiisoft/mailer-symfony` bridge, the only transport adapter in the `mail` family) or the `mail` row of the [package-catalog.md §1 Capability Quick-Lookup Matrix](package-catalog.md#1-capability-quick-lookup-matrix). The optional queue-based delivery path and the `BeforeSend`/`AfterSend` lifecycle events are owned by the [Mailer Async Sending & Lifecycle Events Guide](infra-mailer-async-queue.md).

---

## Table of Contents
- [1. Transport Configuration (useSendmail, esmtpTransport)](#1-transport-configuration-usesendmail-esmtptransport)
- [2. Message Defaults (messageSettings)](#2-message-defaults-messagesettings)
- [Related Topic Guides](#related-topic-guides)

---

## 1. Transport Configuration (`useSendmail`, `esmtpTransport`)

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

The package auto-registers `MailerInterface::class => Yiisoft\Mailer\Symfony\Mailer::class` and the `TransportInterface` definition via its config plugin. It does **not** bind `Psr\EventDispatcher\EventDispatcherInterface` — supply one to enable the lifecycle events described in the [Mailer Async Sending & Lifecycle Events Guide](infra-mailer-async-queue.md), §7.

## 2. Message Defaults (`messageSettings`)

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

---

## Related Topic Guides

- [Mailer & Email Notifications Guide](infra-mailer.md) — Message composition and sending (the default synchronous path), HTML templating, file attachments, dev/test mailers (`FileMailer`/`StubMailer`/`NullMailer`), and StubMailer testing recipes.
- [Mailer Async Sending & Lifecycle Events Guide](infra-mailer-async-queue.md) — Optional queue-based background delivery and the `BeforeSend`/`AfterSend` lifecycle events.
- [Queue & Asynchronous Jobs Guide](infra-queue-jobs.md) — Queue adapters, middlewares, message contracts, and worker lifecycle in depth.
- [Events & Listeners Guide](core-events-and-listeners.md) — PSR-14 listener registration, config groups, and `yiisoft/yii-event` wiring.
- [DI & Configuration Guide](core-di-and-config.md) — Config groups, params merging, and DI definition overrides.
