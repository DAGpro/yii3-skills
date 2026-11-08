# Rubric: 55-aif-e2e-workflow

## Model Judge Criteria
1. **AI Factory Plan & Architecture Resolution:** Stage 0 correctly detects `.ai-factory/config.yaml`, resolves `.ai-factory/ARCHITECTURE.md`, and adopts `.ai-factory/plans/2026-11-08-newsletter-subscription.md`.
2. **Mission State Tracker Discipline:** Outputs the explicit Mission State tracker and executes stages bottom-up (Migration -> Domain/Repository -> Use Case -> Presentation -> Wiring -> Tests).
3. **Per-Step Wiring Gates:** Every interface is bound in DI, every action is routed, and domain events are mapped.
4. **Handoff Artifact:** The final output produces a valid `aif-gate-result` block with `blockers` and `affected_files`.

