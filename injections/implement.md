## Yii3 support (from aif-ext-yii3)

Run this block right after Step 0 (pre) Handoff detection.

1. If the project does not use Yii3 (no `yiisoft/*` in `composer.json`), ignore the rest of this block.
2. Otherwise load the `yii3` skill (`SKILL.md`) and follow it for every task: architecture placement → dependency protocol → conventions.
3. **Architecture & Decomposition:** use the artifact this skill has already loaded (`/aif-architecture`, `paths.architecture`). If absent,
   mirror the existing project structure in `src/` and `config/` plus 2–3 similar existing features. Follow `references/core-feature-recipes.md`.
   Print `Architecture: <source>`.
4. **Execution order for features (Strict Bottom-Up):**
   * Never implement an Action or Controller before its Input DTO, Repository Interface, and Use Case exist.
   * Step 1: Migration -> Step 2: Domain Entity & Repository Interface -> Step 3: Repository Implementation -> Step 4: Use Case Handler & Events -> Step 5: Input DTO & Single-Action Handler (or Console Command) -> Step 6: Config Wiring (DI, Routes, Events) -> Step 7: Tests.
5. **Mandatory Signature Lookup Protocol:**
   * Before calling any `yiisoft/*` method or constructor with more than 1 argument, search the actual installed signature in `vendor/yiisoft/<pkg>/src` (or see `references/core-api-signatures.md`).
   * Never invent method names from memory or copy Yii2 APIs.
6. **Thin Actions & Focused Commands:** Action classes must only coordinate HTTP (extract/hydrate DTO, validate via `yiisoft/validator`, call Use Case, return `ResponseInterface` via `ResponseFactory\DataResponseFactoryInterface`). Console Commands must only configure CLI input/output (`SymfonyStyle`, `ExitCode`) and delegate processing to Use Cases. Never put SQL queries, password hashing, or email sending directly inside an Action or Command.
7. **Per task (Source of Truth):** check `composer.json` against `references/package-catalog.md`; install missing packages per `references/core-dependency-protocol.md` BEFORE writing code that uses them. Inspect `vendor/yiisoft/<pkg>/src/` for real signatures and methods. Never write Yii2 APIs.
8. **Wiring immediately:** when introducing an interface, immediately add its DI binding in `config/**/di/*.php`. When introducing an Action, immediately register its route in `config/**/routes.php`. When introducing a Console Command, immediately register it in `config/console/params.php`.
9. **Autonomous mode (`HANDOFF_MODE=1`):** never ask the user. Where the protocol says "ask", use what the project already uses,
   otherwise the `yiisoft/*` default, and record the decision in the task summary; if that is impossible, report the task as blocked.
10. Use the project's own commands for composer/tests/linters (Makefile, composer scripts, Docker, Psalm/PHPStan, Rector, PHPUnit).
