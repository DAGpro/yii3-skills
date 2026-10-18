## Yii3 support (from aif-ext-yii3)

Run this block right after Step 0 (pre) Handoff detection.

1. Run the `yii3` skill's `scripts/yii3-context.mjs` (Node, no deps; add `--root <dir>` if `composer.json` is not in the cwd).
   If the JSON says `"yii3": false`, ignore the rest of this block.
2. Otherwise load the `yii3` skill (`SKILL.md`) and follow it for every task: architecture placement → dependency protocol → conventions.
3. **Architecture:** use the artifact this skill has already loaded (`/aif-architecture`, `paths.architecture`). If the script reports
   `architecture.source: "inferred"`, mirror the structure it lists plus 2–3 similar existing features. Print `Architecture: <source>`.
4. **Per task:** run the script with `--need <capability,...>`; install what is missing per `references/dependency-protocol.md`
   BEFORE writing code that uses it; read `vendor/yiisoft/<pkg>` for the real API. Never write Yii2 APIs.
5. **Autonomous mode (`HANDOFF_MODE=1`):** never ask the user. Where the protocol says "ask", use what the project already uses,
   otherwise the `yiisoft/*` default, and record the decision in the task summary; if that is impossible, report the task as blocked.
6. Use the project's own commands for composer/tests/linters (`tooling` in the script output: Makefile, composer scripts, Docker).
