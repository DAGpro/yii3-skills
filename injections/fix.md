## Yii3 support (from yii3-skills)

Guard: activate this block only for a Yii 3 application — at least one `yiisoft/yii-*` package (application/runtime stack, e.g. `yiisoft/yii-runner-http`, `yiisoft/yii-runner-console`, `yiisoft/yii-http`, or `yiisoft/yii-console`; `yiisoft/yii2` excluded) in `composer.json` or `composer.lock`. Yii 2 project (`yiisoft/yii2` present), Yii-ecosystem library (only base `yiisoft/*` packages like `yiisoft/di` or `yiisoft/strings`, without application runtime stack), or non-Yii project: ignore this block and do not apply Yii 3 rules. Unknown project state (neither composer.json nor composer.lock present, contradictory evidence): do not auto-activate — ask the user or report the task blocked (`composer.json` declares intent; `composer.lock` confirms installed versions). Otherwise load the `yii3` skill and apply defect resolution per it — the skill is the single source of rules:

Fix-specific duties:
- Root-cause diagnostics: apply SKILL.md Stage 0 item 3(c) "Bug / diagnostics" root-cause checklist in order: DI & configuration → input hydration & validation → routing & middleware → API signatures in `vendor/yiisoft/<pkg>/src`.
- File placement & style: keep the fix in the file's current place and local style (SKILL.md Core rule 2); do not relocate code.
- Implementation grounding: implement API calls strictly per installed vendor sources and the skill's reference guides; flag legacy drift patterns without copying them into new code.
- Zero-ambiguity resolution: resolve blockers strictly within `affected_files` from `aif-gate-result`, clear resolved items from `Open Issues` in `### Execution State`, set `Status: PENDING_VERIFICATION`, and hand off cleanly to `/aif-verify`.

