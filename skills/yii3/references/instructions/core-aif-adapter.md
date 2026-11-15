# AI Factory Adapter — Multi-Agent Workflow Integration & Durable State

> [!IMPORTANT]
> **Grounding rule:** This guide defines the inter-agent coordination contract between the `yii3` skill and the AI Factory automation loop (`aif-plan`, `aif-implement`, `aif-verify`, `aif-fix`, `aif-review`, `aif-improve`, `aif-roadmap`, `aif-architecture`). It governs workflow lifecycle transitions, active plan state persistence, and handoff boundaries.

---

## 1. Operating Model & Responsibility Separation

This is the `yii3` skill's **default operating mode** (AI Factory extension): whenever the target project runs AI Factory — an invoking `aif-*` workflow or a present `.ai-factory/` directory — the skill operates as a specialized domain engine embedded within broader multi-agent workflows. Only when neither signal is present (no `.ai-factory/` directory AND no `aif-*` invocation) does the skill fall back to standalone operation (plans via root `PLAN.md` / `docs/plans/`, concluded at the Finale without AI Factory handoff artifacts — see SKILL.md, "Operating Context Routing"). The repository and runtime separation of concerns:

- **AI Factory Workflows (`aif-*`):** Own high-level project automation, task scheduling, plan artifact durability, and cross-agent invocation loops.
- **Yii3 Skill (`yii3`):** Single source of truth (SSOT) for Yii 3 framework architecture, bottom-up assembly progression, per-step wiring gates, signature lookup protocols, and Definition of Done gates.
- **Injections (`injections/*.md`):** Lightweight activation hooks that inject Yii 3-specific duties into standard AI Factory workflows without duplicating framework rules.

---

## 2. AI Factory Workflow Lifecycle Protocol

The standard feature lifecycle follows a strict state-machine protocol:

`plan` → `implement` → `verify` ⇄ (blockers / fixes) → `fix` → `verify` → `complete`

### Role Binding (One Role per Invocation)

Each skill invocation inside the automation loop executes **exactly the role of the calling `aif-*` workflow** — roadmap, architecture, plan, implement, verify, fix, review, improve, or tooling workflows (`aif`, `build-automation`, `ci`, `dockerize`, `security-checklist`). The role is detected from the invoking `aif-*` command or the loaded workflow injection. The matrix below is the authority for what that role may modify and must output; per-role duties are anchored in the matching workflow injection. Only the `aif-implement` role runs the full Mission Workflow implementation path; `aif-plan`, `aif-verify`, `aif-fix`, `aif-review`, `aif-improve`, `aif-roadmap`, and `aif-architecture` execute only their scoped duties and hand off per the matrix. Invocations without an `aif-*` role signal do not enter this role-binding protocol; they route by operating context per §1 — AI Factory mode when a `.ai-factory/` directory is present, and the standalone fallback (`core-standalone-adapter.md`) only when neither an `aif-*` invocation nor a `.ai-factory/` directory exists.

### Workflow Responsibility & Boundary Matrix

| Workflow | Role & Phase | Input Artifacts | Allowed Modifications | Output Artifacts | Next Handoff |
|---|---|---|---|---|---|
| **`aif`** | Project initialization & agent context setup | Project directory, `composer.json` | `.ai-factory/` scaffolding, agent skills config | Configured AI Factory project context with Yii 3 awareness | `/aif-architecture` or `/aif-plan` |
| **`aif-roadmap`** | Milestone sequencing & stack invariants | Project vision, requirements, package manifest | Roadmap file ONLY (`ROADMAP.md`) | Structured roadmap with stack invariants, driver choices, and architecture milestones | `/aif-architecture` or `/aif-plan` |
| **`aif-architecture`** | Architectural guideline synthesis & pattern alignment | Tech stack, project requirements, existing code | Architecture artifact ONLY (`paths.architecture`) | Canonical `ARCHITECTURE.md` defining directory structure, architecture patterns, and legacy strategies | `/aif-plan` |
| **`aif-plan`** | Feature decomposition & planning | Prompt / user requirements, project architecture (`paths.architecture`) | Plan file ONLY (no application code) | Active plan artifact with 6 canonical phases + initial `### Execution State` | `/aif-implement` |
| **`aif-implement`** | Bottom-up execution | Active plan artifact (`paths.plans`) | Application code (`src/`, `config/`, `migrations/`, `tests/`), task checkboxes `- [x]`, `### Execution State` | Fully wired feature code + updated plan state | `/aif-verify` |
| **`aif-verify`** | Independent verification gate | Implemented code, test suite, active plan | **Code Read-Only:** Strictly forbidden to modify application code or fix bugs. Allowed to write gate results and update plan `### Execution State` | `aif-gate-result` (`blockers`, `affected_files`) + updated plan state (`COMPLETE` or `BLOCKED`) | `/aif-fix` (if blockers > 0) or complete |
| **`aif-fix`** | Defect resolution | `aif-gate-result`, active plan, failing tests | Bug fixes in affected files (`src/`, `config/`), plan `### Execution State` | Fixed application code + updated plan state | `/aif-verify` (re-verification) |
| **`aif-review`** | Quality & architecture audit | Changed files, git diff, rules | Review report ONLY (read-only audit) | Structured code review report with findings & suggestions | User / developer |
| **`aif-improve`** | Plan refinement | Draft plan, project codebase | Plan file ONLY (re-orders tasks, adds missing wiring steps) | Refined plan artifact | User / `/aif-implement` |
| **`aif-build-automation`** | Build tool configuration (Makefile, Taskfile) | Project runner, composer scripts, toolchain | Build automation files (`Makefile`, `Taskfile.yml`, etc.) | Tested build targets for Yii 3 runtime, migrations, and quality gates | Developer / CI |
| **`aif-ci`** | CI pipeline configuration | Project test runners, PHP version, linters | CI workflow files (`.github/workflows/`, etc.) | Hardened CI pipeline executing lint, static analysis, and runtime tests | Developer / Git push |
| **`aif-dockerize`** | Containerization & production hardening | Runtime stack (SAPI, RoadRunner, FrankenPHP) | Dockerfile, compose files, `.dockerignore` | Multi-stage Docker setup matching Yii 3 runner requirements | Developer / Deployment |
| **`aif-security-checklist`** | Security audit & vulnerability gate | Application code, auth/session configs, inputs | Security audit report (`.ai-factory/SECURITY.md`) | Structured security findings against Yii 3 anti-patterns | Developer / `/aif-fix` |

### Integration Scope & Unhooked Workflows

- **Hooked Workflows (13 injections registered in `extension.json`):** Deeply integrate with Yii 3 idioms, enforcing signature verification, architecture patterns, and wiring gates across project setup, architecture, planning, coding, verification, and operations.
- **Unhooked Workflows:** Generic AI Factory lifecycle utilities (e.g. `aif-explore`, `aif-warmup`, `aif-commit`, `aif-rules-check`, `aif-qa`, `aif-archive`) do not require specialized Yii 3 injections. They operate as framework-agnostic commands, interacting with the project through standard filesystem artifacts, git operations, and generic AI Factory contracts without modifying Yii 3 invariants.

### The `aif-verify` Code-Read-Only Invariant

> [!IMPORTANT]
> **Strict Boundary:** `aif-verify` is an objective, independent quality gate.
> - **Forbidden:** Modifying application code (`src/`), configuration (`config/`), migrations, or writing fix implementations. Verification must never silently patch code to make checks pass.
> - **Permitted:** Running linters, static analysis, test runners; generating `aif-gate-result`; updating `### Execution State` in the active plan artifact (`Status: COMPLETE` when blockers are zero, `Status: BLOCKED` when blockers exist).
> - **Defect Resolution:** All corrective code changes belong exclusively to `aif-fix`.

---

## 3. Durable Plan State Contract (`### Execution State`)

Because AI Factory workflows execute across independent agent sessions with distinct conversation contexts, the active plan artifact (`.ai-factory/plans/*.md` or root `PLAN.md`) acts as the **durable state carrier**.

Every active plan must maintain an explicit execution state block at the end of the file:

```markdown
### Execution State
- **Stage:** Stage <N> — <Stage Name>
- **Status:** <IN PROGRESS | COMPLETE | BLOCKED | PENDING_VERIFICATION>
- **Artifacts:**
  - `<path/to/File.php>` (<Role / Architectural Layer>)
- **Wiring Gates:**
  - DI binding: <PASS | PENDING | N/A>
  - Routes / CLI: <PASS | PENDING | N/A>
  - Events / Migrations: <PASS | PENDING | N/A>
- **Verification:**
  - Syntax / Project Checks: <PASS | FAIL | NOT RUN>
  - Unit / HTTP Tests: <PASS | FAIL | NOT RUN | BLOCKED>
- **Open Issues:** <None | Description of blockers>
- **Next Stage:** <Next Stage number and name | Finale>
```

### Resume Protocol for Subsequent Agents

When an agent (`aif-implement`, `aif-verify`, `aif-fix`) resumes work on an existing task:

1. **Locate Active Plan:** Read the active plan from the configured location (`paths.plans`).
2. **Inspect Execution State:** Parse `### Execution State` to identify the last completed step, created artifacts, and pending wiring gates.
3. **Verify File Existence:** Validate that listed artifacts actually exist on disk before progressing.
4. **Advance State:** Progress to `Next Stage`, update checkboxes `- [x]`, and refresh `### Execution State` upon landing each step's wiring gate.

---

## 4. Path & Configuration Resolution Contract

The skill respects target project customization configured in `.ai-factory/config.yaml`:

```yaml
paths:
  plans: .ai-factory/plans       # Active and archived plan artifacts
  architecture: .ai-factory/ARCHITECTURE.md  # Supreme project architectural authority
  rules_file: .ai-factory/rules/yii3.md      # Project-specific AI rules
```

- If `.ai-factory/config.yaml` is absent while the operating context is still AI Factory (an invoking `aif-*` workflow or a present `.ai-factory/` directory — see §1), resolve paths by their defaults: the invoking workflow's artifact or `paths.plans` fallback locations `PLAN.md` / `docs/plans/` for plans, and guide-placement rules for architecture. The standalone fallback does **not** apply here — it triggers only when there is no `aif-*` invocation AND no `.ai-factory/` directory (SKILL.md "Operating Context Routing").
- When an architecture artifact exists, it is the supreme structural authority for file placement and naming conventions (Core rule 2, Project conventions).

### Architecture Artifact Authority (`/aif-architecture`)

The architecture artifact produced by `/aif-architecture` (`paths.architecture` from `.ai-factory/config.yaml`, else `.ai-factory/ARCHITECTURE.md`) is the supreme structural authority: it fixes the Architecture Pattern (`Explicit Architecture`, `Structured Modules`, `Layered Architecture`), module boundaries, and naming conventions; the skill never re-derives them. Architecture Patterns (`Explicit Architecture`, `Structured Modules`, `Layered Architecture`) govern component structure and placement across feature archetypes (recipes: `references/instructions/core-feature-archetypes.md` §1).

---

## 5. Non-Interactive Protocol (`HANDOFF_MODE=1`)

In automated or headless execution environments (`HANDOFF_MODE=1`), interactive user prompts are prohibited:

- **Missing Decision:** Always prefer what the target project already uses (dominant convention in `src/`); if ambiguous, default to the official `yiisoft/*` recommendation.
- **Blocking Impediment:** If a mandatory dependency cannot be resolved or an ambiguous architecture choice violates core rules, record the exact technical reason and return `Status: BLOCKED` in `aif-gate-result` instead of guessing or stalling.

---

## 6. Zero-Ambiguity Handoff Contract (Self-Contained Transition Guarantee)

Across AI Factory workflows, independent agents run in separate conversational contexts without shared memory. Any ambiguity, missing file path, or implicit assumption left by one agent creates errors or hallucinations in the next. Every handoff must be **100% self-contained**:

### 6.1. Handoff: `aif-plan` → `aif-implement` (Unambiguous Plan Specification)
- **Concrete Target Paths:** Every task must specify the exact target file path (in ultra plans: in the phase's `Files to Change`) and architectural layer/role. Generic tasks without paths (e.g. "create controller and service") are strictly prohibited.
- **Upstream-First Context Ordering:** If the feature spans multiple Bounded Contexts, tasks for the provider (upstream) context (its schema, repository, models, and public API in `src/<Module>/Api/`) must be scheduled and completed before tasks in consumer contexts. Cross-context communication must strictly use public APIs or PSR-14 events, explicitly forbidding cross-module SQL joins or internal model imports.
- **Explicit Topic Guide Attachment:** For each task, the planner must map the requirement to the Task & Intent Routing Matrix in SKILL.md or the topic index in `references/INDEX.md` and attach the exact guide path: `Guide: references/packages/<guide-name>.md` (or `references/instructions/<guide-name>.md`). Tasks lacking an assigned guide are prohibited.
- **Prior Dependency Installation:** Every missing capability from `references/package-catalog.md` must be planned as an explicit `composer require` task scheduled *before* any implementation tasks that import its namespace.
- **Explicit Wiring Tasks:** Every planned interface must have an explicit DI registration task (`config/**/di/*.php` default, or the project's active service provider), and every Action an explicit route wiring task (`config/**/routes.php` default, or the active `FileRouter` convention).
- **Initialized Execution State:** The plan must conclude with an initialized `### Execution State` block template setting `Stage 1` (or `Step 1`) as pending and all wiring gates as `PENDING`.

### 6.2. Handoff: `aif-implement` → `aif-verify` (Self-Contained Implementation Handoff)
- **Mandatory Pre-Implementation Guide Read:** Before writing code for any task, the implementer must read the task's assigned `Guide: references/packages/<guide-name>.md` (or resolve it from `references/INDEX.md` if missing) and verify API signatures in `vendor/yiisoft/<pkg>/src/`. Generating code without consulting the guide is strictly prohibited.
- **Cross-Context Boundary Enforcement:** Code must interact with other modules strictly via `src/<Module>/Api/` or PSR-14 events. Direct queries against another module's database tables or internal model instantiations are strictly forbidden.
- **Complete Artifact Inventory:** Every newly created or modified file must be listed in `### Execution State` under `Artifacts:` with its architectural role (e.g. `- src/Blog/PostAction.php (Presentation / Action)`). Never leave files unrecorded.
- **Verified Wiring Gates:** Every per-step wiring gate must be explicitly verified and recorded (`DI binding: PASS`, `Routes / CLI: PASS`, `Events / Migrations: PASS`). Batching or deferring wiring is forbidden.
- **Task Checkboxes:** All completed phase tasks must be marked `- [x]`.
- **Handoff Status:** Set `Status: COMPLETE` (or ready for verification) and `Next Stage: /aif-verify`.

### 6.3. Handoff: `aif-verify` → `aif-fix` / `/aif-commit` (Zero-Ambiguity Defect Reporting)
- **Canonical `aif-gate-result` Schema (AI Factory 2.x):** Emit the structured gate result as the final fenced block with language `aif-gate-result` at the end of the output:
  ````markdown
  ```aif-gate-result
  {
    "schema_version": 1,
    "gate": "verify",
    "status": "fail",
    "blocking": true,
    "blockers": [
      {
        "id": "verify-001",
        "severity": "error",
        "file": "src/Blog/CreateCommentAction.php",
        "summary": "SQL query found inside Action; actions must remain thin HTTP transport adapters."
      }
    ],
    "affected_files": [
      "src/Blog/CreateCommentAction.php"
    ],
    "suggested_next": {
      "command": "/aif-fix",
      "reason": "Blocking implementation violations remain."
    }
  }
  ```
  ````
- **Status Semantics:**
  - `status: "pass"`: All architectural gates and checks pass without blocking or warning findings. Set `blocking: false`, `blockers: []`, and `suggested_next: { command: "/aif-commit", reason: "Verification passed." }` (or `null`).
  - `status: "warn"`: Completed with non-blocking findings (e.g. unverified API symbols without vendor, non-blocking architecture drift `WARN [architecture-drift]`). Set `blocking: false`, `blockers: []`, and `suggested_next: { command: "/aif-commit", reason: "Verification passed with advisory warnings." }`.
  - `status: "fail"`: Found at least one blocker. Set `blocking: true`, populate `blockers: [...]` with structured objects, and set `suggested_next: { command: "/aif-fix", reason: "Blocking implementation violations remain." }`.
- **Actionable Blocker Reports:** Every entry in `blockers` must be a structured object with `id`, `severity: "error"` (or `"warning"` if policy treats warning as blocking), `file`, and `summary`.
- **Inspected Perimeter vs Remediation Scope (`affected_files` vs `blockers[].file`):**
  - `affected_files` is the array of files the gate actually evaluated or cited during verification (the inspected perimeter).
  - `blockers[].file` indicates the specific file containing an identified violation.
  - `aif-fix` modifies only the files needed to resolve the blockers within the inspected perimeter, never modifying unaffected evaluated files.
- **Handoff Status:** Set `Status: BLOCKED` and `Next Stage: /aif-fix` in `### Execution State` when blockers exist; set `Status: COMPLETE` when all checks pass.

### 6.4. Handoff: `aif-fix` → `aif-verify` (Clean Defect Resolution Loop)
- **Scope Compliance:** Corrective edits must target the files identified in `blockers[].file` within the `affected_files` perimeter without introducing unrelated changes or new architectural mechanisms.
- **State Reconciliation:** Clear resolved defects from `Open Issues`, confirm wiring gates remain `PASS`, set `Status: PENDING_VERIFICATION`, and hand off cleanly to `/aif-verify`.

---

## 7. Subagent Delegation & Context Preservation Protocol

When an agent delegates scoped sub-tasks to child agents (via subagent invocation, parallel worker pools, or specialized research/review subagents), subagents execute in **fresh or isolated conversation contexts**. Without deliberate context injection, a subagent loses the parent's constraints and defaults to pre-trained parametric memory (generating legacy Yii 2 patterns, static facades, or database queries inside presentation actions).

### 7.1. Context Bleed & Isolation Risks

| Risk / Failure Mode | Root Cause in Subagent | Prevention Rule |
|---|---|---|
| **Yii 2 Regression** | Subagent lacks Yii 3 awareness; hallucinates `Yii::$app`, `ActiveRecord::find()`, behaviors. | Explicit skill loading directive (`Load the yii3 skill`) + `Yii3 is not Yii2` invariant in brief. |
| **Presentation Pollution** | Subagent writes raw SQL or injects `ConnectionInterface` directly into Action/Command. | Explicit Presentation Isolation rule in brief; Action must return PSR-7 `ResponseInterface`. |
| **Architecture Divergence** | Subagent creates classes in wrong directories or invents new architectural layers. | Explicitly pass active Architecture Pattern (`Explicit`, `Structured`, `Layered`) and target file paths. |
| **Unconfirmed Signatures** | Subagent guesses constructor arguments or method names. | Mandatory instruction to inspect `vendor/yiisoft/<pkg>/src/` for all signatures. |
| **Unregistered Wiring** | Subagent creates classes but neglects DI, route, command, or event registration. | Explicit requirement to include or report immediate wiring definitions. |

### 7.2. Context Readiness Gate

Before spawning or messaging a child agent, the parent agent MUST evaluate the subagent's runtime execution environment:

1. **Condition A — Shared Workspace & Skill Access:** The subagent has access to the repository filesystem and can read the skill package (`references/`) and `vendor/yiisoft/`. The parent passes relative paths: `"Load the 'yii3' skill; read and adhere to references/packages/<guide-name>.md"`.
2. **Condition B — Isolated / Ephemeral Sandbox:** The subagent runs in a separate or restricted context lacking access to the parent's skill repository or `vendor/`. The parent agent **MUST inline** the relevant rules, exact FQCN signatures, DI syntax, and Anti-Pattern constraints directly into the delegation brief.
3. **Condition C — Ambiguous Context / Low-Capability Environment:** If the child environment cannot guarantee adherence to modern Yii 3 invariants and cannot receive sufficient inline context, delegation is prohibited: execute the task within the parent conversation or report `Status: BLOCKED`.

### 7.3. Mandatory Delegation Brief Elements

Every prompt or assignment brief delegating work to a subagent **MUST** explicitly incorporate the following 5 anchors:

1. **Skill Loading Directive:**
   Instruct the subagent to load and adhere to the skill:
   `"You are working on a modern Yii 3 (PHP 8.2+, yiisoft/* packages) project. Load and strictly adhere to the 'yii3' skill."`
2. **Architecture Pattern & Target Paths:**
   Specify the project's active architecture pattern (`Explicit Architecture`, `Structured Modules`, or `Layered Architecture` from `paths.architecture`) and the exact bounded file paths the subagent is authorized to touch:
   `"Architecture Pattern: <Pattern>. Target file(s): <exact paths>. Do NOT touch vendor/ or config/.merge-plan.php."`
3. **Governing Topic Guides:**
   Attach the specific topic guides governing the assigned slice from `references/packages/`:
   `"Read and follow governing guide(s): references/packages/<guide-name>.md."`
4. **Mandatory Signature Grounding & Invariants:**
   State the core invariants explicitly:
   `"Ground all API signatures in vendor/yiisoft/<package>/src/. Presentation classes must remain thin (zero direct SQL or persistence in actions/commands). Dependencies via constructor DI only (no Yii::$app, no static facades)."`
5. **Required Subagent Execution Receipt:**
   Mandate that the subagent conclude its response with the structured `### Subagent Execution Receipt` block defined in §7.5.

### 7.4. Canonical Subagent Delegation Prompt Template

Use this canonical template when spawning or messaging subagents for Yii 3 tasks:

````markdown
You are implementing a scoped task for a Yii 3 application.
Load and strictly adhere to the 'yii3' skill.

Project Architecture: [Explicit Architecture | Structured Modules | Layered Architecture]
Governing Guide(s): references/packages/[guide-name].md
Assigned Task: [Precise description of the task and expected deliverables]

Target File(s) to Create / Modify:
- [path/to/File.php] ([Architectural Role / Layer])

Mandatory Yii 3 Invariants:
1. Yii3 is NOT Yii2: zero Yii::$app, no static facades, constructor DI everywhere.
2. Presentation Isolation: actions and commands are thin HTTP/CLI transport adapters. Zero direct SQL, persistence, or transactions in presentation.
3. Signature Grounding: inspect vendor/yiisoft/[package]/src/ to verify all class names, method signatures, and parameter types before writing code.
4. Immediate Wiring: provide the exact DI binding (config/**/di/*.php) and route/command registration for any created class.
5. Post-Commit Rule: never dispatch domain events or queue jobs with external side effects inside an open database transaction.

Output Contract:
Conclude your implementation with the exact structured block:
### Subagent Execution Receipt
- **Status:** [COMPLETE | BLOCKED]
- **Target Files Modified:** [list of relative file paths]
- **Verified API Signatures:** [list of FQCN::method() verified against vendor/yiisoft/*/src/]
- **Verified Wiring Gates:** DI: [PASS | NA], Routes/CLI: [PASS | NA], Events/Migrations: [PASS | NA]
- **Open Issues / Residual Assumptions:** [None | description]
````

### 7.5. Structured Subagent Execution Receipt Schema

Subagents must return their execution summary using this machine-verifiable format:

````markdown
### Subagent Execution Receipt
- **Status:** COMPLETE
- **Task ID:** task-04-action-implementation
- **Target Files Modified:**
  - src/Blog/Comment/CreateCommentAction.php (Presentation / Action)
  - config/common/routes.php (Transport Wiring)
- **Governing Guides Consulted:** references/packages/http-actions-core.md, references/packages/http-forms-and-hydration.md
- **Verified API Signatures:**
  - Yiisoft\DataResponse\ResponseFactory\DataResponseFactoryInterface::createResponse()
  - Yiisoft\Hydrator\HydratorInterface::create()
- **Verified Wiring Gates:** DI: PASS, Routes/CLI: PASS, Events/Migrations: NA
- **Open Issues / Residual Assumptions:** None
````

### 7.6. Receipt & Quality Verification Gate

The parent agent retains full responsibility for the task outcome and must never accept subagent artifacts blindly:

1. **Receipt Verification:** Confirm the presence and completeness of the `### Subagent Execution Receipt`. If missing or incomplete, mandate re-submission before proceeding.
2. **Evidence-Based Perimeter Audit:** Independently inspect filesystem changes (e.g. `git status`, `git diff --name-only`, file existence checks) rather than accepting textual claims at face value. Verify that the subagent actually created or modified the authorized target files and did not alter `config/.merge-plan.php` or `vendor/`.
3. **Anti-Pattern Gate:** Audit the subagent's code against the governing guide's `## Anti-Pattern Matrix` (e.g. no direct SQL in action, no uncommitted event dispatch).
4. **AST & Signature Compliance:** Verify that all invoked methods and parameter types match the installed package sources in `vendor/yiisoft/<pkg>/src/`.
5. **State Reconciliation:** Upon successful audit, integrate the created artifacts into the active plan's `### Execution State` (or `### Mission State`), record passing wiring gates, and advance the workflow. If defects are found, reject the output and issue a scoped fix prompt or re-assign to `/aif-fix`.


