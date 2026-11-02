## Yii3 support (from aif-ext-yii3)

If the project does not use Yii3 (no `yiisoft/*` in `composer.json`), ignore this block.

When planning in a Yii3 project:
- Load the `yii3` skill.
- **Decompose business features via `references/core-feature-recipes.md`:**
  * Classify the request into an archetype (State-changing process, Read/Query listing, Async job, Web form, CLI/Console command, RESTful Resource CRUD, File Upload).
  * Infer required capabilities and companion packages from business terms (e.g. passwords → `security`, emails → `mailer`+`events`, tables → `db`+`migrations`, CLI → `yii-console`, REST API → `data-response`+`input-http`+`validator`, files → `validator`+`http`).
  * **Mandatory Artifact Graph Decomposition Contract:**
    Every state-changing feature or CRUD API request MUST be decomposed into a minimum of 6 discrete phases/tasks:
    1. **Migration & Schema:** Table creation, indexes, foreign keys via `yiisoft/db-migration`.
    2. **Domain Layer:** Pure Entity/Aggregate, Value Objects, Domain Events (PSR-14), Repository Interface.
    3. **Persistence Layer:** Repository Implementation (`yiisoft/db`, Active Record, or Cycle) + Transaction wrapper.
    4. **Application Layer:** Use Case Command & Handler with post-commit event dispatching, Event Listeners.
    5. **Presentation Layer:** Input DTO with rule attributes (`#[Required]`, `#[Length]`, `#[StringValue]`, …) + Single Action Handler (or Console Command).
    6. **Wiring & Tests:** DI bindings (`config/**/di/*.php`), Routes (`config/**/routes.php`), Events (`config/**/events.php`), Unit & HTTP Tests.
    *Reject any plan that attempts to collapse this graph into 1-2 generic "create controller" tasks.*
  * Keep Actions thin: never plan database queries, password hashing, or notification sending directly in Actions. For console commands, delegate business execution to Use Cases.
- Place every new file per the architecture source (`/aif-architecture` artifact, else the existing
  project layout) and name the target path/layer in each task (in ultra plans: in the phase's `Files to Change`).
- Inspect `composer.json` against `references/package-catalog.md` and `references/core-feature-recipes.md` for required capabilities.
  For each missing package add an early task "Install `yiisoft/<pkg>` and wire config" (composer require + params/DI/bootstrap); pick a driver matching the project.
- Put config tasks (routes, DI, params, migrations, console registration) before the code that depends on them.
- Ensure every newly planned interface has a corresponding DI binding task in `config/**/di/*.php` and every Action has a route task in `config/**/routes.php`.
- Do not introduce a new folder structure or a second mechanism (ORM, router, DI style) next to the existing one.
