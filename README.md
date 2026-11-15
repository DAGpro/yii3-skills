# Yii 3 Agent Skill

> Production-ready Agent Skill and [AI Factory](https://github.com/lee-to/ai-factory) extension for idiomatic **Yii 3** development (PHP 8.2+, `yiisoft/*` packages).

The **`yii3`** skill equips AI coding agents (**Cursor, Claude Code, Windsurf, OpenCode, Devin**) and automated **AI Factory** pipelines with deep, grounded knowledge of the modern Yii 3 ecosystem. It guides agents through requirement analysis, dependency discovery, clean bottom-up code assembly, and strict verification.

## Key Invariants

- **Zero Yii 2 Hallucinations**: Strict ban on legacy constructs (`Yii::$app`, static facades, ActiveRecord event coupling). Enforces modern Yii 3 idioms: PSR-7 / PSR-15 / PSR-14, DI autowiring, strict immutability, hydrators, and input DTOs.
- **100% Grounded in Official Sources**: All patterns, signatures, and configuration recipes are verified directly against 136 official `yiisoft/*` package repositories.
- **Respects Your Architecture**: Seamlessly adapts to your codebase layout (Explicit Clean Architecture, Structured Modules, or Layered Architecture) without imposing alien conventions.

## Installation

### In Any Agent Skills Host (Cursor, Claude Code, Windsurf)

Install via the `skills` CLI:

```bash
npx skills add DAGpro/yii3-skills --skill yii3
```

Or clone directly into your project's agent configuration directory:

```bash
# For Cursor
git clone https://github.com/DAGpro/yii3-skills.git .cursor/skills/yii3-skills

# For Claude Code / OpenCode
git clone https://github.com/DAGpro/yii3-skills.git .agents/skills/yii3-skills
```

### In AI Factory Projects

Install via the AI Factory CLI to automatically hook into all project automation pipelines:

```bash
ai-factory extension add https://github.com/DAGpro/yii3-skills.git
```

## Usage & Examples

### In AI Factory Workflows

The extension hooks directly into your project's AI Factory automation loop without manual configuration:

```bash
# 1. Plan feature — decomposes into bottom-up tasks (Migration → Repo → Handler → Action DTO → DI Wiring)
/aif-plan "Add Stripe payment checkout and webhook signature verification"

# 2. Implement — builds idiomatic Yii 3 code with immediate DI and route wiring
/aif-implement

# 3. Verify — runs Yii 3 Chain Integrity audit (active routes, bound DI, reversible migrations, zero anti-patterns)
/aif-verify

# 4. Review — audits changes against Yii 3 anti-pattern matrices and security invariants
/aif-review
```

### In Standalone Agent Chat (Cursor, Claude Code, Windsurf)

Invoke the skill naturally in your interactive agent chat:

```text
"Create a Yii 3 REST API endpoint for user profile update with DTO validation and Cycle ORM."
"Add an asynchronous queue job for email notifications using Transactional Outbox in Yii 3."
"Generate a reversible database migration and repository for an Order aggregate."
"Integrate Stripe payments and webhook signature verification using yiisoft/payments."
"Review our DI configuration and route definitions against Yii 3 anti-pattern matrices."
```

## How It Works

Rather than generating disconnected files or monolithic controllers, the skill guides agents through a disciplined two-phase workflow:

1. **Top-Down Discovery (Trace Dependencies):**
   - Identifies the entry point (Action, Command, Queue Job, Migration).
   - Enforces context boundaries: cross-module communication occurs strictly via public APIs or PSR-14 events.
   - Traces missing dependencies downward: Transport → Use Case → Repository Contract → Database Schema.

2. **Bottom-Up Assembly (Assemble Code):**
   - Assembles discovered components in reverse dependency order:
     1. **Schema & Migration:** Reversible migrations with table prefixes (`{{%table}}`) and working `down()`.
     2. **Persistence & Boundary:** Repository port interfaces and concrete implementations.
     3. **Application & Domain:** Use cases with transaction management (`$db->transaction()`) and post-commit domain events.
     4. **Transport & Entry Point:** Thin Actions returning PSR-7 `ResponseInterface` with validated DTOs.
   - **Immediate Wiring:** DI definitions (`config/**/di/*.php`), routes (`routes.php`), or event listeners are wired immediately upon creating each class.

*Universal Invariant:* Controller actions are strictly thin HTTP transport adapters returning `ResponseInterface`. Zero SQL, direct persistence, or transaction management in presentation.

## Supported Stack & Subsystems

Covers the complete official Yii 3 ecosystem (PHP 8.2+):

- **HTTP & Routing:** FastRoute, URL generation, PSR-15 middleware pipeline, error handling (`ErrorCatcher`, `ExceptionResponder`), content negotiation, CORS, CSRF.
- **Data & Persistence:** `yiisoft/db` (MySQL, PostgreSQL, SQLite), database migrations (`yiisoft/db-migration`), Active Record (`yiisoft/active-record`) or Cycle ORM (`cycle/*`), data providers, and paginators.
- **Input & Validation:** `yiisoft/validator` (attribute-based rules), `yiisoft/hydrator` (type-safe DTO population), request body parsers.
- **Security & Auth:** PSR-7/PSR-15 authentication (`CurrentUser`, session, JWT, OAuth2), RBAC access control (`yiisoft/rbac` with DB/PHP storage).
- **Async & Infrastructure:** `yiisoft/queue` (DB, Redis, AMQP, Sync), `yiisoft/scheduler` (cron & background tasks), Transactional Outbox pattern with mutex-guarded relay workers.
- **E-Commerce & Payments:** `yiisoft/payments` (multi-gateway abstraction for Stripe, PayPal, YooKassa, Robokassa; webhook verification).
- **Views & Templating:** `yiisoft/view`, `yiisoft/yii-view-renderer`, Twig integration, Bootstrap 5 / Bulma widgets, asset bundles.
- **Testing:** Unit, HTTP integration, database testing, console testing, mutation testing (Infection), PSR test doubles (PHPUnit 10/11, Codeception, Testo).
- **Long-Running Runtimes:** RoadRunner and FrankenPHP workers with state resetters (`StateResetter`).

## What is Inside

- **`skills/yii3/SKILL.md`** — Core workflow contract, invariants, and the task routing matrix.
- **`skills/yii3/references/`** — 100 specialized reference guides (structured into `instructions/` for architectural rules and `packages/` for component recipes) and the runtime package catalog.
- **`injections/`** — Automated workflow hooks for AI Factory projects.

## Known Limitations

- **Code & Architecture Guidance Only**: The skill generates and audits code; your test suite, linters, and migrations execute through your project's PHP toolchain.
- **External Dependencies**: Non-`yiisoft` packages and PHP deprecations are verified against your project's `composer.lock`, not offline clones.
- **Out of Scope**: Front-end build tooling (beyond `yiisoft/assets`), GraphQL, and application-level infrastructure.

## Contributing

Guidelines for contributing, ground rules, and testing are documented in [CONTRIBUTING.md](CONTRIBUTING.md); the full constitution lives in [AGENTS.md](AGENTS.md).

## License

[MIT](LICENSE) © DAGpro and yii3-skills contributors.
