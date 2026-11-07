## Yii3 support (from yii3-skills)

Guard: activate this block only for a Yii 3 project — `yiisoft/*` packages in `composer.json` AND no `yiisoft/yii2` in `composer.json` or `composer.lock`. Yii 2 project (`yiisoft/yii2` present) or non-Yii project (no `yiisoft/*`): ignore this block and do not apply Yii 3 rules. Ambiguous project state (missing `composer.lock`, contradictory evidence): do not auto-activate — ask the user or report the task blocked. Otherwise load the `yii3` skill (`SKILL.md`) and plan against its "Mission Workflow (Stages 1–7)" section — the skill is the single source of stage contracts, wiring gates, and the phase → stage mapping table.

Plan-specific duties (the rules themselves live in the skill):

- Decompose state-changing features into the skill's 6 plan phases (see the phase → stage mapping table in SKILL.md Mission Workflow). Reject any plan that collapses this graph into 1–2 generic "create controller" tasks.
- Name the target file path/layer in each task (in ultra plans: in the phase's `Files to Change`), resolved per the architecture source in SKILL.md Stage 0.
- Check `composer.json` against the skill's `references/package-catalog.md`. For each missing capability add an early task "Install `yiisoft/<pkg>` and wire config" (composer require + params/DI/bootstrap) BEFORE the tasks whose code uses it, per `references/core-dependency-protocol.md`; pick exactly one driver per family per catalog §3.
- Put config tasks (routes, DI, params, migrations, console/event registration) before the code that depends on them; every planned `*Interface` gets a DI-binding task in `config/**/di/*.php`, every Action a route task in `config/**/routes.php`. At execution the wiring happens per step (the skill's per-step wiring gates), so the Stage 6 config task is the final audit — never deferred wiring.
- Do not plan a new folder structure or a second mechanism (ORM, router, DI style) next to the existing one — SKILL.md Stage 0 item 2.
- Existing-code refactoring goes only to "💡 Out of scope".
