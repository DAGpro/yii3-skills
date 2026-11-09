# AI Factory Adapter — Multi-Agent Workflow Integration & Durable State

> [!IMPORTANT]
> **Grounding rule:** This guide defines the inter-agent coordination contract between the `yii3` skill and the AI Factory automation loop (`aif-plan`, `aif-implement`, `aif-verify`, `aif-fix`, `aif-review`, `aif-improve`, `aif-roadmap`, `aif-architecture`). It governs workflow lifecycle transitions, active plan state persistence, and handoff boundaries.

---

## 1. Operating Model & Responsibility Separation

When running inside an automated AI Factory environment, the `yii3` skill operates as a specialized domain engine embedded within broader multi-agent workflows. The repository and runtime separation of concerns:

- **AI Factory Workflows (`aif-*`):** Own high-level project automation, task scheduling, plan artifact durability, and cross-agent invocation loops.
- **Yii3 Skill (`yii3`):** Single source of truth (SSOT) for Yii 3 framework architecture, bottom-up stage progression, per-step wiring gates, signature lookup protocols, and Definition of Done gates.
- **Injections (`injections/*.md`):** Lightweight activation hooks that inject Yii 3-specific duties into standard AI Factory workflows without duplicating framework rules.

---

## 2. AI Factory Workflow Lifecycle Protocol

The standard feature lifecycle follows a strict state-machine protocol:

`plan` → `implement` → `verify` ⇄ (blockers / fixes) → `fix` → `verify` → `complete`

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

- If `.ai-factory/config.yaml` is absent, fallback to standard locations: `PLAN.md` or `docs/plans/` for plans, and guide-placement rules for architecture.
- When an architecture artifact exists, it is the supreme structural authority for file placement and naming conventions (Core rule 2, Project conventions).

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

### 6.3. Handoff: `aif-verify` → `aif-fix` (Zero-Ambiguity Defect Reporting)
- **Actionable Blocker Reports:** Every failure in `aif-gate-result` (`blockers`) and `### Execution State` (`Open Issues`) must specify:
  1. The exact file path and line number.
  2. The violated rule, broken invariant (e.g. "SQL inside Action"), or failing test name.
  3. The exact error output or exception trace.
- **Strict Modification Perimeter:** `aif-gate-result` must populate `affected_files` with the exact list of files requiring remediation so `aif-fix` knows its exact boundary.
- **Handoff Status:** Set `Status: BLOCKED` and `Next Stage: /aif-fix`.

### 6.4. Handoff: `aif-fix` → `aif-verify` (Clean Defect Resolution Loop)
- **Scope Compliance:** Corrective edits must remain strictly within `affected_files` without introducing new architectural mechanisms.
- **State Reconciliation:** Clear resolved defects from `Open Issues`, confirm wiring gates remain `PASS`, set `Status: PENDING_VERIFICATION`, and hand off cleanly to `/aif-verify`.


