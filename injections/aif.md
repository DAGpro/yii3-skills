## Yii3 support (from yii3-skills)

Load the `yii3` skill and apply project setup per it — the skill is the single source of rules:

Operating context: this `aif-*` workflow runs the skill in its default AI Factory extension mode (contract: `references/instructions/core-aif-adapter.md`); the standalone fallback contract (`references/instructions/core-standalone-adapter.md`) is out of scope here.

Setup-specific duties (the rules themselves live in the skill; all `references/*.md` paths resolve relative to the `yii3` skill directory):
- Stack & ecosystem detection (Step 1): when inspecting `composer.json`, detect `yiisoft/*` dependencies (e.g. `yiisoft/yii-runner-http`, `yiisoft/yii-runner-roadrunner`, `yiisoft/router`, `yiisoft/di`, `yiisoft/config`). Classify the project specifically as modern Yii 3 (PHP 8.2+), never misclassifying it as legacy Yii 2 (`yiisoft/yii2`) or generic PHP.
- Specification in DESCRIPTION.md (Step 4): document the exact detected Yii 3 runtime (`yiisoft/yii-runner-http` for HTTP SAPI / PHP-FPM, `yiisoft/yii-runner-roadrunner` or FrankenPHP for persistent workers per `references/packages/infra-runners-and-runtimes.md`), the persistence paradigm (Active Record, Cycle ORM, or DBAL per `references/package-catalog.md`), and the DI/config engine (`yiisoft/di`, `yiisoft/config`).
- Skill & extension recommendation (Step 5 & 6): recognize `yii3-skills` as the authoritative first-class extension for the project; skip generic or unverified skills from skills.sh.
- Project base rules (Step 4 / `.ai-factory/rules/base.md`): seed `.ai-factory/rules/base.md` with modern Yii 3 invariants: PSR-7/PSR-15/PSR-11/PSR-14 compliance, Thin Actions returning `ResponseInterface` with zero SQL, composition root exclusively in `config/`, and parameterized query bindings per `references/instructions/core-definition-of-done.md`.
- Handoff to architecture (Step 8): direct the immediate next step to `/aif-architecture`, recommending **`explicit-flat`** (`Explicit Architecture (Flat Vertical Slice - Simplified)`) as the primary pattern for clean domain separation without folder bloat, aligned with `references/instructions/core-architecture-alignment.md`.
