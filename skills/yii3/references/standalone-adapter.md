# Standalone Adapter — Direct Invocation Contract & Self-Verification Loop

> [!IMPORTANT]
> **Grounding rule:** This guide defines the operating contract for the `yii3` skill when the target project does **not** run AI Factory — the standalone fallback: no `.ai-factory/` directory AND no `aif-*` workflow invocation (detection rules in SKILL.md, "Operating Context Routing"). It governs task resolution, durable state, interaction protocol, and the self-verification loop that replaces AI Factory orchestration.

---

## 1. Operating Model & Responsibility Separation

In standalone mode the skill is the entire pipeline: one agent plans, implements, verifies, and reports, with no external orchestrator:

- **User:** owns decisions, task scoping, and the execution mode override (`--mode=patch|feature|enterprise`); the skill interacts with the user directly (interactive-first).
- **Yii3 Skill (`yii3`):** Single source of truth (SSOT) for Yii 3 framework architecture, bottom-up stage progression, per-step wiring gates, signature lookup protocols, and Definition of Done gates — and additionally owns plan resolution, self-verification, and the final report.
- **No workflow injections:** the `injections/*.md` hooks are not loaded; the skill never emits AI Factory artifacts (`aif-gate-result` blocks, mandatory `### Execution State` carriers, `HANDOFF_MODE=1` semantics).

---

## 2. Standalone Lifecycle Protocol

`resolve task → Stage 0 bootstrap → Mission Workflow (Stages 1–7, bottom-up) → self-verification (Finale) ⇄ fix → final report`

### Self-Verification Discipline (replaces the external `aif-verify` gate)

> [!IMPORTANT]
> The Finale is an independent audit pass, not a formality.

- After the last stage, run the Finale (SKILL.md) as an audit over the touched artifacts only: project checks first, then the Chain Integrity & Code-to-Reference Compliance Audit (Finale item 2).
- **Never silently patch code while auditing.** If the audit finds a defect, report it as a finding first, apply the correction as a separate step scoped to the defect's file(s), then re-run the Finale until it is clean or a genuine user decision is required.
- The audit itself is read-only with respect to application code; corrective edits happen explicitly, after the audit verdict.

### Fix Loop

On blockers: diagnose in the Stage 0 item 3(c) root-cause order (DI & config → input hydration & validation → routing & middleware → signatures in `vendor/yiisoft/<pkg>/src`), fix within the reported blocker perimeter only (no unrelated refactors), and re-run the Finale. Repeat until zero blockers, then produce the final report.

---

## 3. Durable State Contract (`### Mission State` & resolved plans)

- **Primary state carrier:** the `### Mission State` tracker printed at Stage 0 (SKILL.md Stage 0 item 5, with `Context: Standalone`) and updated as stages complete.
- **Resolved plan artifacts:** when the task resolves to an existing plan (root `PLAN.md` or `docs/plans/*.md`), keep its task checkboxes `- [x]` reconciled; if the plan contains a `### Execution State` block, maintain it in the same format as the AI Factory contract (`aif-adapter.md` §3) so a later session — or a later AI Factory adoption — can resume without re-deriving state.
- **Never invent plan artifacts.** Create a plan file only when the user explicitly asks to persist the mission (suggested location: `docs/plans/`).

### Resume Protocol for Subsequent Sessions

1. **Locate the plan** per §4, or ask the user for the task scope if none resolves.
2. **Inspect state:** parse `### Execution State` (if present) or the conversation's `### Mission State`; identify the last completed stage, created artifacts, and pending wiring gates.
3. **Verify file existence:** validate listed artifacts actually exist on disk before progressing.
4. **Advance state:** continue bottom-up, updating checkboxes `- [x]` and the state tracker upon landing each per-step wiring gate.

---

## 4. Path & Configuration Resolution Contract (no `.ai-factory/config.yaml`)

| Question | Standalone resolution | AI Factory equivalent |
|---|---|---|
| Plans | explicit argument/link → root `PLAN.md` → newest `*.md` in `docs/plans/` or `docs/plan/` | `paths.plans` |
| Architecture | `docs/architecture/` → dominant layout of 2–3 existing features in `src/` → Pragmatic tier (`layers`) fallback (Core rule 3) | `paths.architecture` / `.ai-factory/ARCHITECTURE.md` |
| Rules & conventions | project `AGENTS.md` / `CONTRIBUTING.md` / README conventions → dominant `src/` style | `paths.rules_file` |
| Milestones / roadmap | none — the user states goals per invocation | `.ai-factory/ROADMAP.md` |

When an architecture artifact is found in `docs/architecture/`, it is the supreme structural authority for file placement and naming conventions (Core rule 2, project conventions) — the same authority `ARCHITECTURE.md` holds in AI Factory mode.

Execution Mode (`Patch | Feature | Enterprise`) and Architectural Tier (`Pragmatic | Balanced | Strict`) are orthogonal — all 9 combinations are valid (`references/core-architecture-alignment.md` §1; per-tier recipes: `references/core-feature-recipes.md`).

### Architecture Tier Self-Derivation (Fallback)

When no architecture artifact exists (`docs/architecture/` absent), derive the Architectural Tier from the dominant layout of 2–3 existing features in `src/` (patterns and tiers per `references/core-architecture-alignment.md` §1; per-tier recipes per `references/core-feature-recipes.md`):

- **Layered (`layers`, Pragmatic):** `Actions` → `Application Services` → `Repositories / Active Record` (no layer skipping; port interfaces optional).
- **Structured Modules (`structured*`, Balanced):** Feature modules; AR/Cycle permitted; module-boundary interfaces.
- **Explicit (`explicit*`, Strict):** Pure POPO domain aggregates/VOs, explicit repository ports, dedicated `*Command`/`*Handler` use cases.

Ambiguous or new projects: fall back to the Pragmatic tier (`layers`) (Core rule 3). Never re-derive the tier when an architecture artifact exists — an artifact from `/aif-architecture` (`.ai-factory/ARCHITECTURE.md`) is the supreme authority in AI Factory mode (SKILL.md "Architectural Alignment"); a `docs/architecture/` artifact holds the same authority here.

---

## 5. Interaction Protocol (Interactive Default)

Standalone runs interactively unless the caller is headless:

- **Interactive (default):** ambiguous decisions (architecture choice, dependency addition, destructive operations, convention conflicts with correctness or security implications) are asked; each decision and its reason is recorded in the final report.
- **Headless / autonomous runner (no user available):** mirror the AI Factory non-interactive discipline — prefer what the target project already uses (dominant convention in `src/`); if ambiguous, default to the official `yiisoft/*` recommendation; if a mandatory decision cannot be resolved, stop with an explicit `blocked` report per `references/core-dependency-protocol.md` instead of guessing or stalling.

---

## 6. Output & Handoff Contract (No `aif-gate-result`)

The task concludes at the Finale with the `references/core-definition-of-done.md` §4 report block: `Mode`, `Architecture`, `fixes applied`, `tests` (`pass | fail | not run | blocked (<reason>) | n/a`), `static analysis`, `packages added`, `config files changed`, `production readiness gate`.

- **Findings format:** blockers and warnings are structured prose items with file paths and severity (blocking defect / convention drift / advisory). No fenced `aif-gate-result` JSON block — that block belongs exclusively to AI Factory extension mode.
- **Unverified APIs:** any `yiisoft/*` API used without a verified installed signature (no `vendor/`, offline) is listed in the report as "not verified against sources" — advisory, never silently ignored.
- **Next steps target the user** (e.g., commit, follow-up feature, test run) — never workflow commands (`/aif-*`).

---

## 7. Mode Boundary & Switching Rule

- **Standalone → AI Factory:** if `.ai-factory/` appears in the project mid-task, or the user invokes any `aif-*` workflow, switch to the AI Factory extension contract (`aif-adapter.md`): plans resolve via `paths.plans`, gates emit `aif-gate-result`, durable state moves to the active plan artifact.
- **AI Factory → Standalone:** the reverse holds per SKILL.md — an AI Factory signal (invoking workflow or `.ai-factory/` directory) is required for extension mode; without it the skill runs standalone.
