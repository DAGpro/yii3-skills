import { check, ok, fail, read, filesMatching } from '../../lib/checks.mjs';

const php = (changed) => changed.filter((c) => c.path.endsWith('.php'));
const srcPhp = (changed) => php(changed).filter((c) => /^src\/.*\.php$/.test(c.path));

// Either a use-import + short type hint, or the fully-qualified type (the common idioms).
const injectsProducer = (t) =>
  (/use\s+Yiisoft\\Queue\\QueueProducerInterface;/.test(t) && /\bQueueProducerInterface\s+\$\w+/.test(t))
  || /\bYiisoft\\Queue\\QueueProducerInterface\s+\$\w+/.test(t)
  || (/use\s+Yiisoft\\Queue\\Provider\\QueueProducerProviderInterface;/.test(t) && /\bQueueProducerProviderInterface\s+\$\w+/.test(t))
  || /\bYiisoft\\Queue\\Provider\\QueueProducerProviderInterface\s+\$\w+/.test(t);

const isQueueMessage = (t) =>
  (/use\s+Yiisoft\\Queue\\Message\\Message;/.test(t) && /extends\s+\\?Message\b/.test(t))
  || /extends\s+\\?Yiisoft\\Queue\\Message\\Message\b/.test(t)
  || (/use\s+Yiisoft\\Queue\\Message\\MessageInterface;/.test(t) && /implements\s+[\w\\,\s]*\bMessageInterface\b/.test(t))
  || /implements\s+[\w\\,\s]*\bYiisoft\\Queue\\Message\\MessageInterface\b/.test(t);

const isQueueHandler = (t) =>
  (/use\s+Yiisoft\\Queue\\Message\\Handler\\HandlerInterface;/.test(t) && /implements\s+[\w\\,\s]*\bHandlerInterface\b/.test(t))
  || /implements\s+[\w\\,\s]*\bYiisoft\\Queue\\Message\\Handler\\HandlerInterface\b/.test(t);

export default [
  check('queue-producer-injected', 'A changed service class type-hints Yiisoft\\Queue\\QueueProducerInterface (or QueueProducerProviderInterface) in its constructor', ({ changed }) => {
    const hit = srcPhp(changed).filter((c) => /__construct\s*\(/.test(read(c.abs)) && injectsProducer(read(c.abs)));
    return hit.length ? ok(hit.map((h) => h.path).join(', ')) : fail('no constructor argument typed QueueProducerInterface in changed src/');
  }),

  check('message-pushed', 'The job message is pushed through the injected producer (->push() in a file that injects the producer interface)', ({ changed }) => {
    const hit = srcPhp(changed).filter((c) => injectsProducer(read(c.abs)) && /\$\w+(?:->\w+)*->push\s*\(/.test(read(c.abs)));
    return hit.length ? ok(hit.map((h) => h.path).join(', ')) : fail('no ->push() call on the injected producer');
  }),

  check('queue-message-typed', 'A dedicated job message class extends Yiisoft\\Queue\\Message\\Message (or implements its MessageInterface) with fromPayload() + getType()', ({ changed }) => {
    const msgs = srcPhp(changed).map((c) => ({ path: c.path, t: read(c.abs) })).filter(({ t }) => isQueueMessage(t));
    if (!msgs.length) return fail('no new class extends Yiisoft\\Queue\\Message\\Message / implements its MessageInterface');
    const complete = msgs.filter(({ t }) =>
      /static\s+function\s+fromPayload\s*\(/.test(t) && /function\s+getType\s*\(/.test(t));
    return complete.length ? ok(complete.map((m) => m.path).join(', ')) : fail('message class lacks fromPayload()/getType()');
  }),

  check('queue-handler-implemented', 'A handler class implements Yiisoft\\Queue\\Message\\Handler\\HandlerInterface with handle(MessageInterface $message): void', ({ changed }) => {
    const handlers = srcPhp(changed).filter((c) => isQueueHandler(read(c.abs)));
    if (!handlers.length) return fail('no new class implements Yiisoft\\Queue\\Message\\Handler\\HandlerInterface');
    const complete = handlers.filter((c) => /function\s+handle\s*\(\s*\\?(?:Yiisoft\\Queue\\Message\\)?MessageInterface\s+\$\w+/.test(read(c.abs)));
    return complete.length ? ok(complete.map((c) => c.path).join(', ')) : fail('handler lacks handle(MessageInterface $message)');
  }),

  check('queue-params-wired', "config declares the 'yiisoft/queue' params block with 'messages' and 'handlers' mappings (serializer + HandlerResolver read them from params)", ({ dir }) => {
    const cfg = filesMatching(dir, /^config\/.*\.php$/).map(read).join('\n');
    const block = /['"]yiisoft\/queue['"]\s*=>/.test(cfg);
    const messages = /['"]messages['"]\s*=>/.test(cfg);
    const handlers = /['"]handlers['"]\s*=>/.test(cfg);
    return block && messages && handlers
      ? ok()
      : fail("no 'yiisoft/queue' params block with 'messages' + 'handlers' mappings found under config/");
  }),

  check('queue-roles-wired', 'Default queue producer/consumer roles are wired: a queues role map in the yiisoft/queue params and/or a QueueProducerInterface DI binding', ({ dir }) => {
    const cfg = filesMatching(dir, /^config\/.*\.php$/).map(read).join('\n');
    const roles = /['"]queues['"]\s*=>/.test(cfg);
    const binding = /QueueProducerInterface::class\s*=>/.test(cfg);
    return roles || binding ? ok() : fail('no queues role map and no QueueProducerInterface binding found under config/');
  }),

  check('no-legacy-queue-api', 'No phantom Yii2-style queue API: QueueInterface, JobInterface::execute($queue), getData()/getHandlerName()', ({ changed }) => {
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

  check('tests-added', 'Tests added (tests/**Test.php)', ({ changed }) =>
    changed.some((c) => c.added && /^tests\/.*Test\.php$/.test(c.path)) ? ok() : fail('no tests'), { required: false }),
];
