## Yii3 support (from aif-ext-yii3)

If the project does not use Yii3 (no `yiisoft/*` in `composer.json`), ignore this block.

When generating or updating ARCHITECTURE.md for a Yii3 project, apply vendor boundaries according to the pattern's architectural strictness:

- **Vendor Isolation by Pattern Strictness:**
  - **Explicit Architecture (Strict):** Core domain is pure POPO with zero vendor imports (`yiisoft/db`, ActiveRecord, views are forbidden). All outbound vendor packages (persistence, cache, queue) live strictly in **Infrastructure**, implementing port interfaces (see `references/core-architecture-alignment.md`).
  - **Layered & Structured Modules (Pragmatic):** Models in `Models/` may inherit from `Yiisoft\ActiveRecord\ActiveRecord` or represent ORM entities. Persistence logic is grouped in Repositories/Services; port interfaces are optional, and concrete classes can be injected directly via DI.
- **Universal Presentation Exception (All Patterns):** Inbound transport (actions and views) directly consumes vendor packages (`yiisoft/router`, `yiisoft/input-http`, `yiisoft/data-response`, `yiisoft/view`, `psr/http-message`). Isolating Presentation from transport primitives is unnecessary. However, controllers/actions must never execute direct database queries.
- **Composition Root Location (All Patterns):** Record where `config/**/di*.php`, `config/**/routes.php`, and `config/**/events*.php` live under the active pattern and state that all DI wiring happens there — never inside `src/`.
- **One Mechanism per Concern (All Patterns):** One DB driver, one ORM path, one queue/cache/mutex driver, one test runner; the architecture must forbid introducing a second competing mechanism later.
