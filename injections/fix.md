## Yii3 support (from yii3-skills)

Load the `yii3` skill and apply defect resolution per it — the skill is the single source of rules:

Operating context: this `aif-*` workflow runs the skill in its default AI Factory extension mode (contract: `references/core-aif-adapter.md`); the standalone fallback contract (`references/core-standalone-adapter.md`) is out of scope here.

Fix-specific duties (the rules themselves live in the skill; all `references/*.md` paths resolve relative to the `yii3` skill directory):
- Root-cause diagnostics: apply SKILL.md Stage 0 item 3(c) "Bug / diagnostics" root-cause checklist in order: DI & configuration → input hydration & validation → routing & middleware → API signatures in `vendor/yiisoft/<pkg>/src`. For the failing component, inspect its topic guide from `references/INDEX.md` (Anti-Pattern Matrix and reference recipes).
- File placement & style: keep the fix in the file's current place and local style (SKILL.md Core rule 2); do not relocate code.
- Implementation grounding: implement API calls strictly per installed vendor sources and the skill's reference guides; flag legacy drift patterns without copying them into new code.
- Zero-ambiguity resolution: resolve structured blockers from `aif-gate-result` (modifying only files needed to remediate `blockers[].file` within the inspected perimeter `affected_files`), clear resolved items from `Open Issues` in `### Execution State`, set `Status: PENDING_VERIFICATION`, and hand off cleanly to `/aif-verify`.

