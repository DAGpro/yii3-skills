## Yii3 support (from yii3-skills)

Guard: activate this block only for a Yii 3 project — `yiisoft/*` packages in `composer.json` AND no `yiisoft/yii2` in `composer.json` or `composer.lock`. Yii 2 project (`yiisoft/yii2` present) or non-Yii project (no `yiisoft/*`): ignore this block and do not apply Yii 3 rules. Ambiguous project state (missing `composer.lock`, contradictory evidence): do not auto-activate — ask the user or report the task blocked. Otherwise load the `yii3` skill and generate or update ARCHITECTURE.md per its `references/core-architecture-alignment.md`:

- Vendor isolation by pattern strictness: strict — pure POPO core, vendor packages only in infrastructure behind port interfaces; pragmatic — `Models/` may inherit from `Yiisoft\ActiveRecord\ActiveRecord`, port interfaces optional.
- Universal presentation exception: inbound transport (actions, views) directly consumes vendor packages (`yiisoft/router`, `yiisoft/input-http`, `yiisoft/data-response`, `psr/http-message`); but actions must never execute direct database queries.
- Composition root location: record where `config/**/di*.php`, `config/**/routes.php`, and `config/**/events*.php` live and state that all DI wiring happens there — never inside `src/`.
- One mechanism per concern (SKILL.md Stage 0 item 2).
