## Yii3 support (from aif-ext-yii3)

If the project does not use Yii3 (no `yiisoft/*` in `composer.json`), ignore this block.

When shaping Yii3 roadmap milestones, enforce these stack invariants (full driver lists:
`references/package-catalog.md`, section "Driver & Storage Selection Rules (Pick Exactly ONE per Family)" (§3):
- **Exactly ONE database driver:** `yiisoft/db-mysql` | `yiisoft/db-pgsql` | `yiisoft/db-sqlite` |
  `yiisoft/db-mssql` | `yiisoft/db-oracle` — plus `yiisoft/db-sqlite` additionally for CI/tests.
  Never two production DB drivers in `require`.
- **Exactly ONE persistence path:** `yiisoft/db` + `yiisoft/active-record` OR `yiisoft/yii-cycle` — never both.
- **Exactly ONE driver per infrastructure family:** queue transport (`queue-db` | `queue-redis` | `queue-amqp`),
  cache storage (`cache-file` | `cache-redis` | `cache-db` | `cache-apcu` | `cache-memcached` | `cache-wincache`),
  mutex driver (`mutex-file` | `mutex-pdo-mysql` | `mutex-pdo-pgsql` | `mutex-pdo-oracle` | `mutex-redis`),
  RBAC storage (`rbac-db` | `rbac-php` | `rbac-cycle-db`), translator message storage
  (`translator-message-php` | `translator-message-db` | `translator-message-gettext`).
- **Exactly ONE test runner:** `phpunit/phpunit` (+ Codeception suites) OR `testo/testo` — mutually exclusive;
  pick the runner in one milestone and keep every later suite on it.
- **Dev tools stay `require-dev`:** `yiisoft/yii-debug`, `yiisoft/yii-gii`, `yiisoft/code-style` never move to
  production `require`.
Add an early milestone: "Run `/aif-architecture` before the first `/aif-plan`" so every subsequent plan
places code against a resolved architecture.
