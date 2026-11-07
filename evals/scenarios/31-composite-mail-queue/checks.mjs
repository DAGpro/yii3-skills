import { check, ok, fail, read, filesMatching } from '../../lib/checks.mjs';

const php = (changed) => changed.filter((c) => c.path.endsWith('.php'));
const srcPhp = (changed) => php(changed).filter((c) => /^src\/.*\.php$/.test(c.path));
const actions = (changed) => srcPhp(changed).filter((c) => /Action\.php$/.test(c.path));

// Either a use-import + short type hint, or the fully-qualified type (the common idioms).
const injectsProducer = (t) =>
  (/use\s+Yiisoft\\Queue\\QueueProducerInterface;/.test(t) && /\bQueueProducerInterface\s+\$\w+/.test(t))
  || /\bYiisoft\\Queue\\QueueProducerInterface\s+\$\w+/.test(t)
  || (/use\s+Yiisoft\\Queue\\Provider\\QueueProducerProviderInterface;/.test(t) && /\bQueueProducerProviderInterface\s+\$\w+/.test(t))
  || /\bYiisoft\\Queue\\Provider\\QueueProducerProviderInterface\s+\$\w+/.test(t);

const injectsMailer = (t) =>
  (/use\s+Yiisoft\\Mailer\\MailerInterface;/.test(t) && /\bMailerInterface\s+\$\w+/.test(t))
  || /\bYiisoft\\Mailer\\MailerInterface\s+\$\w+/.test(t);

const isQueueMessage = (t) =>
  (/use\s+Yiisoft\\Queue\\Message\\Message;/.test(t) && /extends\s+\\?Message\b/.test(t))
  || /extends\s+\\?Yiisoft\\Queue\\Message\\Message\b/.test(t)
  || (/use\s+Yiisoft\\Queue\\Message\\MessageInterface;/.test(t) && /implements\s+[\w\\,\s]*\bMessageInterface\b/.test(t))
  || /implements\s+[\w\\,\s]*\bYiisoft\\Queue\\Message\\MessageInterface\b/.test(t);

const isQueueHandler = (t) =>
  (/use\s+Yiisoft\\Queue\\Message\\Handler\\HandlerInterface;/.test(t) && /implements\s+[\w\\,\s]*\bHandlerInterface\b/.test(t))
  || /implements\s+[\w\\,\s]*\bYiisoft\\Queue\\Message\\Handler\\HandlerInterface\b/.test(t);

const shortClassName = (t) => (t.match(/\bclass\s+(\w+)/) ?? [])[1] ?? '';

export default [
  // The typed message DTO (guides: infra-mailer-async-queue.md §3, infra-queue-jobs.md §2 -
  // extending Message covers only meta; fromPayload/getType/getPayload MUST all be implemented).
  check('dto-shape', 'A dedicated queue message class extends Yiisoft\\Queue\\Message\\Message (or implements its MessageInterface) and implements ALL of fromPayload()/getType()/getPayload() - the abstract base implements none of them', ({ changed }) => {
    const msgs = srcPhp(changed).map((c) => ({ path: c.path, t: read(c.abs) })).filter(({ t }) => isQueueMessage(t));
    if (!msgs.length) return fail('no new class extends Yiisoft\\Queue\\Message\\Message / implements its MessageInterface');
    const complete = msgs.filter(({ t }) =>
      /static\s+function\s+fromPayload\s*\(/.test(t)
      && /function\s+getType\s*\(/.test(t)
      && /function\s+getPayload\s*\(/.test(t));
    return complete.length ? ok(complete.map((m) => m.path).join(', ')) : fail('message class lacks fromPayload()/getType()/getPayload() (omitting any one is a fatal error at reconstruction)');
  }),

  check('dto-validates-payload', 'fromPayload() validates the payload structure and throws InvalidArgumentException on bad payloads (worker reconstruction path)', ({ changed }) => {
    const hit = srcPhp(changed).filter((c) => {
      const t = read(c.abs);
      return isQueueMessage(t)
        && /throw\s+new\s+\\?InvalidArgumentException/.test(t)
        && /static\s+function\s+fromPayload\s*\(/.test(t);
    });
    return hit.length
      ? ok(hit.map((h) => h.path).join(', '))
      : fail('no message class whose fromPayload() throws InvalidArgumentException');
  }),

  check('handler-implements-interface', 'A handler class implements Yiisoft\\Queue\\Message\\Handler\\HandlerInterface with handle(MessageInterface $message): void (grounded: HandlerInterface.php)', ({ changed }) => {
    const handlers = srcPhp(changed).filter((c) => isQueueHandler(read(c.abs)));
    if (!handlers.length) return fail('no new class implements Yiisoft\\Queue\\Message\\Handler\\HandlerInterface');
    const complete = handlers.filter((c) => /function\s+handle\s*\(\s*\\?(?:Yiisoft\\Queue\\Message\\)?MessageInterface\s+\$\w+/.test(read(c.abs)));
    return complete.length ? ok(complete.map((c) => c.path).join(', ')) : fail('handler lacks handle(MessageInterface $message)');
  }),

  check('mail-via-queue-handler', 'The queue handler performs the email delivery: a changed src class implements HandlerInterface, injects Yiisoft\\Mailer\\MailerInterface through its constructor and calls ->send() (MailerInterface::send(MessageInterface): void)', ({ changed }) => {
    const hit = srcPhp(changed).filter((c) => {
      const t = read(c.abs);
      return isQueueHandler(t) && /__construct\s*\(/.test(t) && injectsMailer(t) && /\$\w+(?:->\w+)*->send\s*\(/.test(t);
    });
    return hit.length
      ? ok(hit.map((h) => h.path).join(', '))
      : fail('no HandlerInterface-implementing class injects MailerInterface and calls ->send()');
  }),

  check('enqueue-from-action', 'The web action enqueues the job: a changed *Action.php injects Yiisoft\\Queue\\QueueProducerInterface (or QueueProducerProviderInterface) and calls ->push() on it (no monolithic QueueInterface exists in Yii3)', ({ changed }) => {
    const hit = actions(changed).filter((c) => injectsProducer(read(c.abs)) && /\$\w+(?:->\w+)*->push\s*\(/.test(read(c.abs)));
    return hit.length
      ? ok(hit.map((h) => h.path).join(', '))
      : fail('no changed action injects the queue producer and calls ->push()');
  }),

  check('message-referenced-by-action', 'The action pushes the typed message class: the message DTO class is referenced from the changed action (use import or FQ)', ({ changed }) => {
    const names = srcPhp(changed)
      .filter((c) => isQueueMessage(read(c.abs)))
      .map((c) => shortClassName(read(c.abs)))
      .filter((n) => n.length > 0);
    if (!names.length) return fail('no typed message class found to reference');
    const hit = actions(changed).filter((c) => {
      const t = read(c.abs);
      return names.some((n) => new RegExp(`\\b${n}\\b`).test(t));
    });
    return hit.length
      ? ok(`${names.join(', ')} referenced in ${hit.map((h) => h.path).join(', ')}`)
      : fail(`typed message class (${names.join(', ')}) never referenced from a changed action`);
  }),

  check('queue-registration-wired', "config declares the 'yiisoft/queue' params block with 'messages' AND 'handlers' mappings (both keyed by message type) and the handler class is referenced there (HandlerResolver reads params; only-'handlers' registration would reconstruct a GenericMessage)", ({ changed, dir }) => {
    const cfg = filesMatching(dir, /^config\/.*\.php$/).map(read).join('\n');
    if (!/['"]yiisoft\/queue['"]\s*=>/.test(cfg)) return fail("no 'yiisoft/queue' params block under config/");
    if (!/['"]messages['"]\s*=>/.test(cfg) || !/['"]handlers['"]\s*=>/.test(cfg)) {
      return fail("the 'yiisoft/queue' block lacks 'messages'/'handlers' mappings");
    }
    const handlers = srcPhp(changed).filter((c) => isQueueHandler(read(c.abs))).map((c) => shortClassName(read(c.abs)));
    if (!handlers.length) return fail('no HandlerInterface-implementing class to register');
    const unregistered = handlers.filter((n) => !new RegExp(`\\b${n}::class\\b`).test(cfg));
    return unregistered.length
      ? fail(`handler not registered under config/: ${unregistered.join(', ')}`)
      : ok('messages + handlers maps present, handler referenced');
  }),

  check('no-direct-send-in-action', 'The mail send moved out of the request: changed actions contain no MailerInterface usage, no ->send() call and no sleep() stalling', ({ changed }) => {
    const re = /MailerInterface|->\s*send\s*\(|\bsleep\s*\(/;
    const bad = actions(changed).filter((c) => re.test(read(c.abs)));
    return bad.length
      ? fail(`direct mail sending / stalling left in the action: ${bad.map((b) => b.path).join(', ')}`)
      : ok();
  }),

  check('mailer-injected-not-newed', 'Delivery goes through the injected mailer stack: some changed src constructor type-hints MailerInterface, and no hand-built mailer/transport (new Mailer/FileMailer/StubMailer/NullMailer, EsmtpTransport, Dsn) appears in changed src', ({ changed }) => {
    const files = srcPhp(changed);
    const injected = files.filter((c) => /__construct\s*\(/.test(read(c.abs)) && injectsMailer(read(c.abs)));
    if (!injected.length) return fail('no changed src constructor injects MailerInterface');
    const re = /\bEsmtpTransport\b|\bSmtpTransport\b|\bSendmailTransport\b|Transports?::fromDsn|\bDsn\s*\(|\bmail\s*\(\s*\$|new\s+(?:\\?[\w\\]+\\)?(?:Mailer|FileMailer|StubMailer|NullMailer)\s*\(/;
    const bad = files.filter((c) => re.test(read(c.abs)));
    return bad.length
      ? fail(`hand-built mailer/transport in changed src: ${bad.map((b) => b.path).join(', ')}`)
      : ok(injected.map((h) => h.path).join(', '));
  }),

  check('no-phantom-queue-api', 'No phantom Yii2-style queue API: QueueInterface, JobInterface::execute($queue), getData()/getHandlerName()', ({ changed }) => {
    const re = /\bQueueInterface\b|\bJobInterface\b|->getData\s*\(|->getHandlerName\s*\(|function\s+execute\s*\(\s*\$/;
    const bad = php(changed).filter((c) => re.test(read(c.abs)));
    return bad.length ? fail(bad.map((b) => b.path).join(', ')) : ok();
  }),

  check('no-second-broker', 'No second broker driver added alongside queue-db (Pick Exactly ONE per Family)', ({ changed }) => {
    const composer = changed.filter((c) => c.path === 'composer.json').map((c) => read(c.abs)).join('\n');
    return /yiisoft\/queue-(redis|amqp)/.test(composer)
      ? fail('a second broker driver package was added to composer.json')
      : ok();
  }),

  check('no-yii2', 'No Yii2 constructs or #[Override] in changed PHP files', ({ changed }) => {
    const re = /Yii::\$app|\buse\s+yii\\|#\[Override\]|ActiveForm::begin|->getFlash\(/;
    const bad = php(changed).filter((c) => re.test(read(c.abs)));
    return bad.length ? fail(bad.map((b) => b.path).join(', ')) : ok();
  }),

  check('strict-types', 'declare(strict_types=1) in every added PHP file', ({ changed }) => {
    const bad = php(changed).filter((c) => c.added && !/declare\(strict_types=1\);/.test(read(c.abs)));
    return bad.length ? fail(bad.map((b) => b.path).join(', ')) : ok();
  }),
];
