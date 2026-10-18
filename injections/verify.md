
## Yii3 support (from aif-ext-yii3)

Run the `yii3` skill's `scripts/yii3-context.mjs --scan-git <git.base_branch>`; if it reports `"yii3": false`, ignore this block
(no-git repos: pass the changed files via `--scan <files>`). Treat `scan.findings` as evidence, then judge:

1. `unknown-yiisoft-namespace` → **blocking** (code uses a package that is not installed).
   `transitive-dependency` → WARN (add it to `composer.json`). `yii2-api` → **blocking**. `missing-strict-types` → WARN.
2. **Config wiring** (judgment): new services autowirable or defined in DI; routes registered; params present; console commands
   registered; migrations exist for new tables; nothing edited in `vendor/` or `config/.merge-plan.php`.
3. **Architecture** (complements the built-in architecture gate; do not duplicate its findings): new/changed files sit where the
   `/aif-architecture` artifact — or, if `architecture.source` is `inferred`, the existing structure — says; dependency-rule
   violation → blocking, other mismatch → `WARN [architecture-drift]`.
4. Run the project's tests/static analysis (`tooling` in the script output).
Merge these into `aif-gate-result` (`blockers`, `affected_files`) like any other finding.
