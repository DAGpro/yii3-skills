# AI Factory Adapter — Multi-Agent Workflow Integration & Durable State

> [!IMPORTANT]
> **Grounding rule:** This guide defines the inter-agent coordination contract between the `yii3` skill and the AI Factory automation loop (`aif-plan`, `aif-implement`, `aif-verify`, `aif-fix`, `aif-review`, `aif-improve`). It governs workflow lifecycle transitions, active plan state persistence, and handoff boundaries.

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

