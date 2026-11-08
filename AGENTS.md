# AGENTS.md

> Universal instructions, guidelines, and engineering invariants for AI agents and developers working in this repository.

> This file is the **project constitution** and is tracked in git. A short project summary for AI Factory workflows (`aif-*` skills) lives in `.ai-factory/DESCRIPTION.md` (local, not tracked).

---

## 1. Project Overview & Identity

**yii3-skills** is an [AI Factory](https://github.com/lee-to/ai-factory) extension and multi-agent skill package designed to generate, review, audit, and refactor idiomatic code for the **Yii 3** framework (PHP 8.2+, `yiisoft/*` packages).

The repository serves as both an **AI Factory Extension** and an **Agent Skills** distribution across multiple AI environments (Cursor, Antigravity/Gemini, Devin, OpenCode, Windsurf).

> [!IMPORTANT]

> **This repository is NOT a Yii 3 application.**

> - It does NOT run Yii 3, has no application entry point (`public/index.php`), and contains no application `src/` or `vendor/`.

> - **Its sole purpose is Documentation, Rules & Knowledge Distribution:** providing structured guidelines, conventions, recipes, and workflow injections (skills, topic guides, workflow hooks, and package catalogs) for AI agents.

> - The code in `references/` (130 cloned `yiisoft/*` packages) is strictly an offline reference library to study and extract ground-truth signatures and patterns from.

---

## 2. Operating Contexts & Dual Role of `.ai-factory/`

Agents must understand the distinction between the two operating contexts and the **dual nature of `.ai-factory/`**:

### A. Authoring Context (Working Inside THIS Repository)

* **Goal:** You are developing and maintaining the extension itself:

  - Your role is to study the official Yii 3 package sources (in `references/`) and synthesize that knowledge into rules, reference guides, code recipes, and workflow instructions for AI agents.

  - This repository is the extension source (meta-layer), NOT an end-user web application.

  - *Note:* The internal directory structure of skills and instructions may evolve as needed for better developer experience and tool integration.

* **Role of `.ai-factory/` here:** **Internal dev scaffolding** (scaffolding/tooling). It configures how *this* extension repository is managed, planned, and evolved.

* **Offline Source of Truth:**

   - [PACKAGES.md](PACKAGES.md) — **navigation index over the offline library**: a concise catalog of official `yiisoft/*` packages used to decide which of the 130 cloned repositories to study for the current task. Resolve package names here first; never scan all of `references/`.

  - [references/](references/) — cloned source code of official `yiisoft/*` repositories (`src/` for signatures, `docs/` for usage examples).

* **Purity Invariant:**

  - Never pollute distributable skill and reference files with internal repository paths, developer-specific paths, or offline `references/` paths.

  - Maintain universal compatibility with the [Agent Skills specification](https://github.com/anthropics/skills).

### B. Target Runtime Context (When Installed in a User's Yii3 Project)

* **Goal:** The extension is installed in a target project; agents generate, verify, or refactor application code.

* **Role of `.ai-factory/` here:** **Active Operational Control Center (First-Class Citizen)**.

  - The extension is explicitly designed to participate in the target project's AI Factory automation loop.

  - **Injections (`injections/*.md`):** Hook directly into target workflows (`aif-plan`, `aif-implement`, `aif-verify`, `aif-fix`, `aif-review`, `aif-improve`).

  - **Config & Architecture Resolution:** Agents must read the target project's `.ai-factory/config.yaml` to dynamically resolve paths (`paths.architecture`, `paths.rules_file`, `paths.plans`), treat target `.ai-factory/ARCHITECTURE.md` as the supreme structural authority, and comply with target `.ai-factory/rules/`.

* **Runtime Source of Truth:**

  - Installed packages in `vendor/yiisoft/` — the API source of truth (`src/` for signatures); `composer.json` / `composer.lock` for installed versions.

  - Target project's `.ai-factory/` (architecture, rules, config). The skill's guides are the implementation instructions the project code must follow; the existing codebase layout (`src/`, `config/`) is integration context only — never a source of truth.

  - The runtime package catalog delivered with the skill: `skills/yii3/references/package-catalog.md` (**NOT** the root `PACKAGES.md`, which does not exist in target installations).

---

## 3. Repository Architecture & File Classification

The repository is strictly divided into **Distributable Deliverables** and **Internal Development Tooling**.

> [!NOTE]

> The directory structure below illustrates the **current baseline layout**. It is subject to evolution and refactoring as needed for better developer experience, package splitting, and agent workflow integration.

| Layer | Directories / Artifacts | Role in This Repository | Role in Target Project |

| :--- | :--- | :--- | :--- |

| **Deliverables (Product)** | Skills (`skills/`), workflow injections (`injections/`), manifests (`extension.json`) | Core product being authored and maintained | Installed and actively executed by agents (runtime package catalog: `skills/yii3/references/package-catalog.md`) |

| **Operational Nervous System** | `.ai-factory/` | Internal dev config & plans for *this* repo | **Working control center** of the target app (architecture, rules, plans) |

| **Authoring References** | `references/` *(130 repos)*, `PACKAGES.md` (package navigation index) | Offline source of truth for APIs and doc examples; the index telling agents which packages to study per task | `references/` does not exist; `PACKAGES.md` is not used by target agents |

| **Internal Workflows & Rules** | `.agent/`, `.agents/`, `AGENTS.md`, `.docs/` (local spec references) | AI Factory workflow engines, constitution, and spec references for developing *this* repo | Target uses its own installed AI Factory skills/workflows |

| **IDE Adapters & Tooling** | `.cursor/`, `.gemini/`, `.devin/`, `.opencode/` | Multi-environment development configurations and linters | Not distributed to end-user applications |

```

yii3-skills/ (Current baseline structure — subject to evolution)

├── .ai-factory/          # [Internal Dev Tooling here -> Working Control Center in target]

├── .agent/               # [Internal Dev Tooling] Workflows (aif-plan, aif-commit...)

├── .agents/              # [Internal Dev Tooling] Local agent skills

├── skills/               # [DELIVERABLE] Agent skills directory (entry points & topic guides)

│   └── yii3/             # Canonical production skill package (promoted after roadmap M6)

│   │   ├── SKILL.md      # Entry point (YAML frontmatter + Task Routing Matrix + TOC)

│   │   └── references/   # Specialized topic guides, recipes, and the runtime package-catalog.md

├── injections/           # [DELIVERABLE] AI Factory workflow hooks (plan, implement, verify...)

├── references/           # [Authoring Only] Offline clones of yiisoft/* packages

├── scripts/              # [Internal Dev Tooling] Extension quality gate (validate.mjs, per quality_gates.validate_command)

├── AGENTS.md             # [Internal Dev Tooling, tracked] This constitution

├── extension.json        # [DELIVERABLE] Extension manifest registering skills & injections

└── PACKAGES.md           # [Authoring Tooling] Package navigation index over references/

```

---

## 4. Extension Authoring & Synchronization Invariants

When authoring or updating skills, topic guides, and injections in this repository, agents **MUST** enforce the following engineering contracts:

### 4.1. Artifact Synchronization Cascade

Any addition or modification to topic reference guides MANDATES synchronizing dependent artifacts:

1. **Skill Entry Points (`SKILL.md`):**

   - Register the topic in the References inventory of the relevant skill (`references/INDEX.md` or `SKILL.md`) with a concise summary.

   - Add discovery keywords and trigger phrases to the YAML frontmatter `description`.

2. **Package Catalogs:**

   - **Runtime catalog (`skills/yii3/references/package-catalog.md`)** — the deliverable consulted by agents in target projects: every `yiisoft/*` package recommended by a topic guide must be present and correctly categorized there.

   - **Authoring index (`PACKAGES.md`)** — keep it accurate as an index over `references/`: when guides start covering new packages, make sure the index lists them so agents can locate the sources to study.

3. **Workflow Injections (`injections/`):**

   - If the topic introduces architectural quality gates, conventions, or verification checks, update the relevant hooks (`verify.md`, `plan.md`, `implement.md`).

4. **Manifests (`extension.json`):**

   - If a new skill directory or standalone manifest is introduced, register it in `extension.json`.

> [!IMPORTANT]

> A task is NOT complete if dependent registries (skills, package catalogs, injections) are left out of sync.

### 4.2. Grounding & Anti-Hallucination Protocol (Mandatory Code Inspection)

Agents **MUST NOT** rely on pre-trained parametric memory, assumptions, or generic PHP knowledge when authoring Yii 3 skills, reference guides, or examples:

- **Mandatory Inspection of `references/`:** Before generating or updating any reference guide, code snippet, or DI configuration, the agent **MUST** inspect the actual package sources in `references/<package>/`:

  - `references/<package>/src/` — inspect exact class names, method signatures, parameter types, and return types.

  - `references/<package>/docs/` and `tests/` — verify idiomatic usage, configuration syntax, and architectural patterns against real tests and docs.

- **Zero Hallucination Policy:** Never invent method names, guess configuration keys, or assume Yii 2 constructs (`Yii::$app`, static facades). If an API or feature cannot be confirmed directly within `references/`, it MUST NOT be written into the documentation.

### 4.3. References Directory Safety & Search Discipline

- **Strictly Read-Only:** The `references/` directory (130 cloned packages) is strictly read-only authoring reference material. Agents must **NEVER** edit, delete, move, or stage (`git add`) any files within `references/`.

- **Targeted Search:** Never run unconstrained recursive searches across the entire `references/` folder. Resolve the relevant package names via `PACKAGES.md` first, then always target specific packages (e.g., `references/router/...`) to avoid context overflow and timeouts.

### 4.4. Language Invariant (English-Only Deliverables)

All distributable deliverables (skill entry points, topic guides, workflow hooks, and manifests) **MUST** be authored strictly in **English**, regardless of the language used in the conversation with the user.

### 4.5. Agent Skills Specification Compliance

- All skill frontmatters (`SKILL.md`) must strictly comply with the Agent Skills specification.

- The `description` field must not exceed **1024 characters** and must include explicit trigger keywords (`Use when user says "..."`).

- Internal cross-references inside skill files must use relative paths (e.g., `references/<topic>.md`) for universal cross-platform compatibility.

### 4.6. Injection Guard & Structure Contract

All workflow injections (`injections/*.md`) must expose one canonical activation contract so their runtime behavior is uniform across AI Factory workflows:

1. **Activation guard (first content line of the body, byte-identical text in every injection).** The guard decides whether the skill is loaded at all, so it must be self-contained — it cannot live in a file inside the skill. Canonical wording: activate only for a Yii 3 application — at least one `yiisoft/yii-*` package (app/runtime stack; `yiisoft/yii2` excluded) in `composer.json` or `composer.lock`; a Yii 2 project, a Yii-ecosystem library (base `yiisoft/*` packages only, no `yiisoft/yii-*`), or a non-Yii project ignores the block and no Yii 3 rule is applied; an unknown project state (missing `composer.lock`, contradictory evidence) must not auto-activate — ask the user or report the task blocked. The `yiisoft/yii-*` discriminator is mandatory: base `yiisoft/*` libraries alone do not make a project a Yii 3 application.
2. **Single source of rules.** After the guard, every injection defers to the skill ("the skill is the single source of rules") and references concrete SKILL.md / `references/` sections instead of duplicating Yii 3 rules.
3. **Structure.** Guard → load the skill → per-workflow duties (each anchored to a skill section) → handoff/output requirements.
4. **Sync check.** `scripts/validate.mjs` holds the canonical guard prefix as a constant (`CANONICAL_GUARD`) and fails when any injection's guard line does not start with it byte-for-byte, when the guard is not the first content line of the injection body (section heading and blank lines excepted), or when the legacy weak form "no `yiisoft/*` in `composer.json`" is present (it also matches Yii 2 projects and plain Yiisoft-ecosystem libraries).

> [!IMPORTANT]

> Any edit to an activation guard MUST be applied to all injections and to SKILL.md (Stage 0 applicability guard) in the same change.

### 4.7. Workflow Handoff & Artifact Contract

The Yii3 skill and the AI Factory workflows exchange results through explicit artifacts; this contract fixes the boundary between the two systems. Neither side may invent new channels or field names silently.

1. **Finale → `/aif-verify`.** In AI Factory mode the skill's Finale hands control to `/aif-verify`; findings merge into `aif-gate-result` with exactly two fields: `blockers` (blocking gate failures: Chain Integrity violations, failing project checks, packages used in code but not declared in `composer.json`) and `affected_files` (changed file paths). Convention-only mismatches are reported as drift warnings, never as blockers.
2. **Unverified API flag.** Any `yiisoft/*` API used without a verified installed signature (no `vendor/`, offline environment) is listed in the final report as "not verified against sources" and enters `aif-gate-result` as a warning, not a blocker — unless static analysis also fails on it.
3. **Blocked tasks.** When the skill cannot proceed safely (unknown activation state, high-impact dependency decision without a user, mandatory offline install), it reports the task `blocked` with an explicit reason instead of silently choosing; the workflow surfaces the `blocked` status as-is.
4. **Plan artifacts.** The workflow owns the plan location (`paths.plans` from the target `.ai-factory/config.yaml`); the skill never invents one in AI Factory mode. Plans follow the 6-phase contract, and the SKILL.md phase → stage table is the only mapping.

