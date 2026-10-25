# AGENTS.md

> Universal instructions and guidelines for AI agents working in this repository.

---

> [!IMPORTANT]
> **Mandatory Project Context & Invariants:**
> Before performing any planning, analysis, authoring, code inspection, or refactoring in this repository, you **MUST** read and follow [.ai-factory/DESCRIPTION.md](file:///.ai-factory/DESCRIPTION.md).
>
> It serves as the single source of truth for:
> 1. **Project Identity & Scope:** This repo is an AI Factory extension and documentation/rules repository — it is **NOT** a runnable Yii 3 application.
> 2. **Operating Contexts:** Authoring Context (working inside this repo) vs. Target Runtime Context (when installed in a user's Yii 3 app).
> 3. **Anti-Hallucination & Grounding Protocol:** Mandatory inspection of `references/<package>/src/` and `docs/` before authoring any guide or snippet; zero hallucination tolerance.
> 4. **References Directory Safety:** `references/` is strictly READ-ONLY.
> 5. **Artifact Synchronization Cascade:** Invariant requirements for synchronizing skills, topic guides, package catalogs (`PACKAGES.md`), and workflow injections (`injections/`).
> 6. **Language & Spec Standards:** English-only deliverables and Agent Skills specification compliance.