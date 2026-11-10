# AI Factory Adapter — Multi-Agent Workflow Integration & Durable State

> [!IMPORTANT]
> **Grounding rule:** This guide defines the inter-agent coordination contract between the `yii3` skill and the AI Factory automation loop (`aif-plan`, `aif-implement`, `aif-verify`, `aif-fix`, `aif-review`, `aif-improve`, `aif-roadmap`, `aif-architecture`). It governs workflow lifecycle transitions, active plan state persistence, and handoff boundaries.

---

## 1. Operating Model & Responsibility Separation

This is the `yii3` skill's **default operating mode** (AI Factory extension): whenever the target project runs AI Factory — an invoking `aif-*` workflow or a present `.ai-factory/` directory — the skill operates as a specialized domain engine embedded within broader multi-agent workflows. Only when neither signal is present (no `.ai-factory/` directory AND no `aif-*` invocation) does the skill fall back to standalone operation (plans via root `PLAN.md` / `docs/plans/`, concluded at the Finale without AI Factory handoff artifacts — see SKILL.md, "Operating Context Routing"). The repository and runtime separation of concerns:

- **AI Factory Workflows (`aif-*`):** Own high-level project automation, task scheduling, plan artifact durability, and cross-agent invocation loops.
- **Yii3 Skill (`yii3`):** Single source of truth (SSOT) for Yii 3 framework architecture, bottom-up stage progression, per-step wiring gates, signature lookup protocols, and Definition of Done gates.
- **Injections (`injections/*.md`):** Lightweight activation hooks that inject Yii 3-specific duties into standard AI Factory workflows without duplicating framework rules.

---

## 2. AI Factory Workflow Lifecycle Protocol

The standard feature lifecycle follows a strict state-machine protocol:

`plan` → `implement` → `verify` ⇄ (blockers / fixes) → `fix` → `verify` → `complete`

### Role Binding (One Role per Invocation)

Each skill invocation inside the automation loop executes **exactly the role of the calling `aif-*` workflow** — plan, implement, verify, fix, review, improve, roadmap, architecture. The role is detected from the invoking `aif-*` command or the loaded workflow injection. The matrix below is the authority for what that role may modify and must output; per-role duties are anchored in the matching workflow injection. Only the `aif-implement` role runs the full Mission Workflow (Stages 1–7) implementation path; `aif-plan`, `aif-verify`, `aif-fix`, `aif-review`, `aif-improve`, `aif-roadmap`, and `aif-architecture` execute only their scoped duties and hand off per the matrix. Invocations without an `aif-*` role signal do not enter this protocol — they follow the standalone fallback (`core-standalone-adapter.md`).

### Workflow Responsibility & Boundary Matrix

| Workflow | Role & Phase | Input Artifacts | Allowed Modifications | Output Artifacts | Next Handoff |
|---|---|---|---|---|---|
| **`aif-roadmap`** | Milestone sequencing & stack invariants | Project vision, requirements, package manifest | Roadmap file ONLY (`ROADMAP.md`) | Structured roadmap with stack invariants, driver choices, and architecture milestones | `/aif-architecture` or `/aif-plan` |
| **`aif-architecture`** | Architectural guideline synthesis & tier alignment | Tech stack, project requirements, existing code | Architecture artifact ONLY (`paths.architecture`) | Canonical `ARCHITECTURE.md` defining directory structure, isolation tiers, and legacy strategies | `/aif-plan` |
| **`aif-plan`** | Feature decomposition & planning | Prompt / user requirements, project architecture (`paths.architecture`) | Plan file ONLY (no application code) | Active plan artifact with 6 canonical phases + initial `### Execution State` | `/aif-implement` |
| **`aif-implement`** | Bottom-up execution | Active plan artifact (`paths.plans`) | Application code (`src/`, `config/`, `migrations/`, `tests/`), task checkboxes `- [x]`, `### Execution State` | Fully wired feature code + updated plan state | `/aif-verify` |
| **`aif-verify`** | Independent verification gate | Implemented code, test suite, active plan | **Code Read-Only:** Strictly forbidden to modify application code or fix bugs. Allowed to write gate results and update plan `### Execution State` | `aif-gate-result` (`blockers`, `affected_files`) + updated plan state (`COMPLETE` or `BLOCKED`) | `/aif-fix` (if blockers > 0) or complete |
| **`aif-fix`** | Defect resolution | `aif-gate-result`, active plan, failing tests | Bug fixes in affected files (`src/`, `config/`), plan `### Execution State` | Fixed application code + updated plan state | `/aif-verify` (re-verification) |
| **`aif-review`** | Quality & architecture audit | Changed files, git diff, rules | Review report ONLY (read-only audit) | Structured code review report with findings & suggestions | User / developer |
| **`aif-improve`** | Plan refinement | Draft plan, project codebase | Plan file ONLY (re-orders tasks, adds missing wiring steps) | Refined plan artifact | User / `/aif-implement` |

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
- **Status:** <IN PROGRESS | COMPLETE | BLOCKED>
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
2. **Inspect Execution State:** Parse `### Execution State` to identify the last completed stage, created artifacts, and pending wiring gates.
3. **Verify File Existence:** Validate that listed artifacts actually exist on disk before progressing.
4. **Advance State:** Progress to `Next Stage`, update checkboxes `- [x]`, and refresh `### Execution State` upon landing each stage's per-step wiring gate.

---

## 4. Path & Configuration Resolution Contract

The skill respects target project customization configured in `.ai-factory/config.yaml`:

```yaml
paths:
  plans: .ai-factory/plans       # Active and archived plan artifacts
  architecture: .ai-factory/ARCHITECTURE.md  # Supreme project architectural authority
  rules_file: .ai-factory/rules/yii3.md      # Project-specific AI rules
```

- If `.ai-factory/config.yaml` is absent (standalone fallback — the project does not use AI Factory), use standard locations: `PLAN.md` or `docs/plans/` for plans, and guide-placement rules for architecture.
- When an architecture artifact exists, it is the supreme structural authority for file placement and naming conventions (Core rule 2, Project conventions).

### Architecture Artifact Authority (`/aif-architecture`)

The architecture artifact produced by `/aif-architecture` (`paths.architecture` from `.ai-factory/config.yaml`, else `.ai-factory/ARCHITECTURE.md`) is the supreme structural authority: it fixes the Architectural Tier (`Pragmatic | Balanced | Strict`), the architecture pattern, module boundaries, and naming conventions; the skill never re-derives them. Execution Mode (`Patch | Feature | Enterprise`) and Architectural Tier are orthogonal — all 9 combinations are valid (`references/core-architecture-alignment.md` §1; per-tier recipes: `references/core-feature-recipes.md`).

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
- **Explicit Topic Guide Attachment:** For each task, the planner must map the requirement to the Task Routing Matrix in SKILL.md or the topic index in `references/INDEX.md` and attach the exact guide path: `Guide: references/<topic>.md`. Tasks lacking an assigned guide are prohibited.
- **Prior Dependency Installation:** Every missing capability from `references/package-catalog.md` must be planned as an explicit `composer require` task scheduled *before* any implementation tasks that import its namespace.
- **Explicit Wiring Tasks:** Every planned interface must have an explicit DI registration task in `config/**/di/*.php`, and every Action an explicit route task in `config/**/routes.php`.
- **Initialized Execution State:** The plan must conclude with an initialized `### Execution State` block template setting `Stage 1` as pending and all wiring gates as `PENDING`.

### 6.2. Handoff: `aif-implement` → `aif-verify` (Self-Contained Implementation Handoff)
- **Mandatory Pre-Implementation Guide Read:** Before writing code for any task, the implementer must read the task's assigned `Guide: references/<topic>.md` (or resolve it from `references/INDEX.md` if missing) and verify API signatures in `vendor/yiisoft/<pkg>/src/`. Generating code without consulting the guide is strictly prohibited.
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


