import { check, ok, fail, read, filesMatching, matchParen } from '../../lib/checks.mjs';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const php = (changed) => changed.filter((c) => c.path.endsWith('.php'));
const allPhp = (dir) => filesMatching(dir, /\.php$/);

export default [
  check('outbox-migration-exists', 'Revertible migration creates outbox_messages table using ColumnBuilder', ({ dir }) => {
    const migrations = filesMatching(dir, /M\d+.*\.php$/);
    const outboxMig = migrations.find((f) => /createTable\s*\([^)]*outbox_messages/i.test(read(f)));
    if (!outboxMig) return fail('no migration calling createTable for outbox_messages');
    const src = read(outboxMig);
    if (!/RevertibleMigrationInterface/.test(src)) return fail('outbox migration does not implement RevertibleMigrationInterface');
    if (!/ColumnBuilder::/.test(src)) return fail('outbox migration does not use ColumnBuilder');
    if (!/dropTable\s*\([^)]*outbox_messages/i.test(src)) return fail('outbox migration down() does not drop outbox_messages');
    return ok(outboxMig);
  }),

  check('outbox-unique-idempotency-index', 'Outbox migration declares a unique index on idempotency_key and implements TransactionalMigrationInterface', ({ dir }) => {
    const migrations = filesMatching(dir, /M\d+.*\.php$/);
    const outboxMig = migrations.find((f) => /createTable\s*\([^)]*outbox_messages/i.test(read(f)));
    if (!outboxMig) return fail('no outbox_messages migration to inspect for the unique idempotency_key index');
    const src = read(outboxMig);
    if (!/TransactionalMigrationInterface/.test(src)) return fail('outbox migration does not implement TransactionalMigrationInterface');
    if (!/IndexType::UNIQUE/.test(src) || !/idempotency_key/.test(src)) {
      return fail('outbox migration lacks a unique index on idempotency_key');
    }
    return ok(outboxMig);
  }),

  check('processed-messages-migration-exists', 'Revertible migration creates processed_messages with a unique (consumer_name, idempotency_key) index', ({ dir }) => {
    const migrations = filesMatching(dir, /M\d+.*\.php$/);
    const mig = migrations.find((f) => /createTable\s*\([^)]*processed_messages/i.test(read(f)));
    if (!mig) return fail('no migration calling createTable for processed_messages');
    const src = read(mig);
    if (!/RevertibleMigrationInterface/.test(src)) return fail('processed_messages migration does not implement RevertibleMigrationInterface');
    if (!/TransactionalMigrationInterface/.test(src)) return fail('processed_messages migration does not implement TransactionalMigrationInterface');
    if (!/IndexType::UNIQUE/.test(src) || !/consumer_name/.test(src) || !/idempotency_key/.test(src)) {
      return fail('processed_messages migration lacks the unique (consumer_name, idempotency_key) index');
    }
    return ok(mig);
  }),

  check('atomic-transaction-outbox-write', 'Use case/service writes domain order and outbox row inside the same ConnectionInterface::transaction() closure', ({ dir }) => {
    const candidates = allPhp(dir).filter((f) => {
      const s = read(f);
      return /->transaction\s*\(/.test(s) && (/OutboxWriterInterface/.test(s) || /outbox_messages/i.test(s));
    });
    if (!candidates.length) {
      return fail('no PHP class writes outbox inside ConnectionInterface::transaction()');
    }
    return ok(candidates.map((c) => c.split(/[\\/]/).pop()).join(', '));
  }),

  check('no-queue-push-inside-transaction', 'QueueProducerInterface::push() is never called inside a DB transaction closure', ({ dir }) => {
    for (const file of allPhp(dir)) {
      const s = read(file);
      let idx = 0;
      while (true) {
        const match = s.slice(idx).match(/->transaction\s*\(/);
        if (!match) break;
        const openIdx = idx + match.index + match[0].length - 1;
        const closeIdx = matchParen(s, openIdx);
        if (closeIdx === -1) break;
        const body = s.slice(openIdx, closeIdx + 1);
        if (/->push\s*\(/.test(body)) {
          return fail(`${file} calls ->push() inside ->transaction(...)`);
        }
        idx = closeIdx + 1;
      }
    }
    return ok('no ->push() inside transaction closures');
  }),

  check('outbox-writer-di-bound', 'OutboxWriterInterface is bound in config/**/di/*.php', ({ dir }) => {
    const diCfg = filesMatching(dir, /^config\/.*\/di\/.*\.php$/).map(read).join('\n');
    return /OutboxWriterInterface::class\s*=>/.test(diCfg)
      ? ok()
      : fail('missing OutboxWriterInterface::class binding in config/**/di/*.php');
  }),

  check('mutex-guarded-relay-service', 'OutboxRelayService uses MutexFactoryInterface::create()->acquire() with bounded limit and dead_letter handling', ({ dir }) => {
    const relays = allPhp(dir).filter((f) => /MutexFactoryInterface/.test(read(f)) && /outbox_messages/i.test(read(f)));
    if (!relays.length) return fail('no relay service using MutexFactoryInterface and querying outbox_messages');
    const src = read(relays[0]);
    if (!/->create\s*\(/.test(src) || !/->acquire\s*\(/.test(src) || !/->release\s*\(/.test(src)) {
      return fail('relay service does not invoke create()->acquire() / release() lifecycle');
    }
    if (/->acquire\s*\(\s*['"]/.test(src)) {
      return fail('relay service passes lock name string directly to acquire() instead of create()');
    }
    if (!/->limit\s*\(/.test(src)) return fail('relay query lacks bounded ->limit()');
    if (!/dead_letter/.test(src)) return fail('relay lacks dead_letter terminal status handling');
    return ok(relays[0]);
  }),

  check('relay-command-registered', 'Relay console command calls StateResetter::reset(), returns ExitCode::OK, and is wired in config/console/params.php', ({ dir }) => {
    const cmds = allPhp(dir).filter((f) => /Command/.test(f) && /StateResetter/.test(read(f)) && /ExitCode::OK/.test(read(f)));
    if (!cmds.length) return fail('no console relay command using StateResetter and ExitCode::OK');
    const consoleParams = join(dir, 'config', 'console', 'params.php');
    if (!existsSync(consoleParams)) return fail('config/console/params.php missing');
    const cfg = read(consoleParams);
    if (!/yiisoft\/yii-console/.test(cfg) || !/commands/.test(cfg) || !/RelayCommand::class/.test(cfg)) {
      return fail('config/console/params.php does not register OutboxRelayCommand under yiisoft/yii-console commands');
    }
    return ok();
  }),

  check('thin-action', 'CreateOrderAction stays thin: returns ResponseInterface, injects no Repository, ConnectionInterface, or QueueProducerInterface', ({ dir }) => {
    const actions = filesMatching(dir, /Action\.php$/);
    if (!actions.length) return fail('no Action class found');
    for (const a of actions) {
      const s = read(a);
      if (!/ResponseInterface/.test(s)) return fail(`${a} does not return ResponseInterface`);
      if (/RepositoryInterface|ConnectionInterface|QueueProducerInterface|->transaction\s*\(|->push\s*\(/.test(s)) {
        return fail(`${a} leaks repository, DB connection, queue push, or transaction into HTTP action`);
      }
    }
    return ok();
  }),

  check('consumer-idempotency', 'Processed messages table / deduplication guard handles duplicate redelivery', ({ dir }) => {
    const all = allPhp(dir).map(read).join('\n');
    const hasInbox = /processed_messages/.test(all) && /IntegrityException/.test(all);
    return hasInbox
      ? ok()
      : fail('missing {{%processed_messages}} inbox deduplication handling with IntegrityException');
  }),

  check('queue-handler-registered', 'Queue handler for order.placed mapped in config/common/params.php', ({ dir }) => {
    const commonParams = join(dir, 'config', 'common', 'params.php');
    if (!existsSync(commonParams)) return fail('config/common/params.php missing');
    const cfg = read(commonParams);
    return /yiisoft\/queue/.test(cfg) && /handlers/.test(cfg) && /order\.placed/.test(cfg)
      ? ok()
      : fail('config/common/params.php missing order.placed handler mapping');
  }),

  check('no-yii2', 'No legacy Yii2 constructs in changed PHP files', ({ changed }) => {
    const re = /Yii::\$app|\buse\s+yii\\|#\[Override\]/;
    const bad = php(changed).filter((c) => re.test(read(c.abs)));
    return bad.length ? fail(bad.map((b) => b.path).join(', ')) : ok();
  }),

  check('tests-added', 'Integration/unit tests added under tests/', ({ changed }) =>
    changed.some((c) => c.added && /^tests\/.*Test\.php$/.test(c.path)) ? ok() : fail('no tests added'), { required: false }),
];
