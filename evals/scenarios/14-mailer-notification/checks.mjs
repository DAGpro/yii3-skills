import { check, ok, fail, read, filesMatching } from '../../lib/checks.mjs';

const php = (changed) => changed.filter((c) => c.path.endsWith('.php'));
const srcPhp = (changed) => php(changed).filter((c) => /^src\/.*\.php$/.test(c.path));
const actions = (changed) => srcPhp(changed).filter((c) => /Action\.php$/.test(c.path));

// Either a use-import + short type hint, or the fully-qualified type (the common idioms).
const injectsMailer = (t) =>
  (/use\s+Yiisoft\\Mailer\\MailerInterface;/.test(t) && /\bMailerInterface\s+\$\w+/.test(t))
  || /\bYiisoft\\Mailer\\MailerInterface\s+\$\w+/.test(t);
const mentionsMailerInterface = (t) =>
  /use\s+Yiisoft\\Mailer\\MailerInterface;|\bYiisoft\\Mailer\\MailerInterface\b/.test(t);

export default [
  check('mailer-injected', 'A changed service class type-hints Yiisoft\\Mailer\\MailerInterface in its constructor (DI, not a hand-built mailer)', ({ changed }) => {
    const hit = srcPhp(changed).filter((c) => /__construct\s*\(/.test(read(c.abs)) && injectsMailer(read(c.abs)));
    return hit.length ? ok(hit.map((h) => h.path).join(', ')) : fail('no constructor argument typed MailerInterface in changed src/');
  }),

  check('message-composed', 'A message is composed via Yiisoft\\Mailer\\Message - immutable with*() chain or named-argument constructor', ({ changed }) => {
    const files = srcPhp(changed).map((c) => read(c.abs));
    const composed = files.filter((t) =>
      (/use\s+Yiisoft\\Mailer\\Message;/.test(t) && /new\s+\\?Message\s*\(/.test(t))
      || /new\s+\\?Yiisoft\\Mailer\\Message\s*\(/.test(t));
    if (!composed.length) return fail('no Yiisoft\\Mailer\\Message instantiation in changed src/');
    const filled = composed.filter((t) =>
      /->with(?:To|From|Subject|TextBody|HtmlBody|ReplyTo|Priority|Sender|ReturnPath|Header|AddedHeader)\s*\(/.test(t)
      || /(?:to|from|subject|textBody|htmlBody|replyTo):\s*[\$'"]/.test(t));
    return filled.length ? ok() : fail('Message built but no with*() setter or named argument used');
  }),

  check('sent-via-mailer-interface', 'The message is handed to the injected mailer (->send() in a file that uses MailerInterface)', ({ changed }) => {
    const hit = srcPhp(changed).filter((c) => mentionsMailerInterface(read(c.abs)) && /\$\w+(?:->\w+)*->send\s*\(/.test(read(c.abs)));
    return hit.length ? ok(hit.map((h) => h.path).join(', ')) : fail('no ->send() call on the injected MailerInterface');
  }),

  check('no-direct-mail-sending', 'No hand-built transports, locally instantiated mailers, or raw mail() in src/ - delivery goes through the mailer stack', ({ changed }) => {
    const re = /\bEsmtpTransport\b|\bSmtpTransport\b|\bSendmailTransport\b|Transports?::fromDsn|\bDsn\s*\(|\bmail\s*\(\s*\$|new\s+(?:\\?[\w\\]+\\)?(?:Mailer|FileMailer|StubMailer|NullMailer)\s*\(/;
    const bad = srcPhp(changed).filter((c) => re.test(read(c.abs)));
    return bad.length ? fail(bad.map((b) => b.path).join(', ')) : ok();
  }),

  check('mailing-not-in-action', 'HTTP actions do not inject the mailer or compose messages themselves - sending lives in an application service', ({ changed }) => {
    const re = /MailerInterface|new\s+\\?Message\s*\(|new\s+\\?Yiisoft\\Mailer\\Message\b|new\s+\\?Email\s*\(/;
    const bad = actions(changed).filter((c) => re.test(read(c.abs)));
    return bad.length ? fail(bad.map((b) => b.path).join(', ')) : ok();
  }),

  check('mailer-defaults-wired', 'Mailer stack wiring in config/: a yiisoft/mailer-symfony (or yiisoft/mailer) params block or a MailerInterface DI binding', ({ dir }) => {
    const cfg = filesMatching(dir, /^config\/.*\.php$/).map(read).join('\n');
    return /['"]yiisoft\/mailer(-symfony)?['"]|MailerInterface::class\s*=>/.test(cfg)
      ? ok()
      : fail('no mailer params block and no MailerInterface binding found under config/');
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
