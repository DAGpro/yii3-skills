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

   - Register the topic in the References section of the relevant skill with a concise summary.

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

