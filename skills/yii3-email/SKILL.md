---
name: yii3-email
description: >-
  Email workflow for Yii3 with yiisoft/mailer: message composition (text/HTML), rendering bodies
  from view templates + shared layout, attachments and embedded images, sending from
  actions/services/console commands, bulk send results, dev/test stubs (FileMailer, StubMailer,
  NullMailer), Symfony transport configuration. Use when user says "send email", "email template",
  "notification email", "welcome mail", "attachment".
argument-hint: "[email feature description]"
allowed-tools: Read Glob Grep Write Edit Bash(php -l *; composer *) AskUserQuestion Questions
disable-model-invocation: false
metadata:
  author: DAGpro (https://github.com/DAGpro)
  version: "0.1"
  category: framework-yii3
---

# Yii3 Email Workflow

Compose → render → send. Package `yiisoft/mailer` (default = **file mailer**, ideal for dev);
real sending via `yiisoft/mailer-symfony` + a Symfony transport.

## Workflow

### Step 0: Verify Setup

1. `yiisoft/mailer` in composer.json (`composer require yiisoft/mailer`).
2. Real sending: `composer require yiisoft/mailer-symfony` + transport config.
3. Check what is registered in `config/*/di/mailer.php`; ask for purpose, recipients,
   HTML template needs.

### Step 1: Compose the Message

```php
use Yiisoft\Mailer\Message;

$message = new Message(
    from: 'noreply@domain.com',
    to: 'user@example.com',
    subject: 'Welcome!',
    textBody: 'Plain text version',
    htmlBody: '<b>HTML version</b>',
);
```

Immutable modifiers: `withTo()`, `withSubject()`, `withHtmlBody()`, `withCc/Bcc/ReplyTo()`,
`withAttached()`...

Attachments:

```php
use Yiisoft\Mailer\File;

$message = $message->withAttached(
    File::fromPath('/path/to/report.pdf'),                    // existing file
    File::fromContent('CSV,data', 'export.csv', 'text/csv'),  // on-the-fly
);
```

### Step 2: Render Body from Templates

Render via `Yiisoft\View\View` inside a dedicated factory class:

```php
final readonly class WelcomeMailFactory
{
    public function __construct(private View $view) {}

    public function create(string $to, string $name, string $code): Message
    {
        $body    = $this->view->render(__DIR__ . '/templates/welcome.php', ['name' => $name, 'code' => $code]);
        $content = $this->view->render(__DIR__ . '/templates/layout.php', ['content' => $body]);

        return new Message(from: 'noreply@domain.com', to: $to, subject: 'Welcome', htmlBody: $content);
    }
}
```

- Templates are plain PHP files with typed `@var` docblocks; escape user data.
- Layout wraps content for shared CSS/footer; embedded images use `File::fromPath(...)->cid()`
  passed as the template's image src.

### Step 3: Send

Inject `Yiisoft\Mailer\MailerInterface` into action/service/command:

```php
$this->mailer->send($this->welcomeMailFactory->create($input->email, $input->name));
```

Bulk sends return `SendResults`: iterate `$result->failed` and log each failure — never abort a
batch on one bad address.

### Step 4: Environment Configuration

Dev/test must never send real emails:

```php
// test/local DI override
return [
    Yiisoft\Mailer\MailerInterface::class => Yiisoft\Mailer\StubMailer::class,
];
```

| Stub         | Behavior                                         |
|--------------|--------------------------------------------------|
| `FileMailer` | saves messages as files (package default)        |
| `StubMailer` | stores messages in memory (inspectable in tests) |
| `NullMailer` | discards silently                                |

## Rules

- Recipient addresses come from validated input (`/yii3-forms`) — never raw request data.
- Mail factories are separate classes, not inline code in actions; commands stay thin and delegate.
-   Transactional emails triggered by domain events belong in listeners (`/yii3-di`, Part C);
  scheduled/bulk sends run in console commands.

## Verification Checklist

1. `php -l` all files; in dev the message appears in file/spool location instead of being sent.
2. Template renders correct data with escaping applied and layout included.
3. Bulk send logs failures without throwing.

## Related Skills

- `/yii3-view` — view rendering details, layouts, injections
- `/yii3-di` — event wiring: welcome/notification emails as event listeners (Part C)
