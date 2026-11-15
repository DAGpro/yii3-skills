You are the lead architect implementing a scoped feature for a modern Yii 3 application under AI Factory.
The active task in `.ai-factory/plans/2026-11-15-update-bio.md` requires implementing the User Bio update Action (`src/User/Profile/UpdateBioAction.php`) and its route wiring (`config/routes.php`).

Per the Subagent Delegation & Context Preservation Protocol (`references/instructions/core-aif-adapter.md` §7):
1. Evaluate the subagent's execution environment using the Context Readiness Gate.
2. Formulate the mandatory Subagent Delegation Brief with all required anchors (Skill loading, Architecture Pattern, Governing guide, Invariants, and Required Receipt).
3. The child subagent has completed its scoped implementation and returned its output. Perform the parent Receipt & Quality Verification Gate (verify perimeter, audit against anti-patterns, check signatures against `vendor/yiisoft/*/src/`).
4. Reconcile execution state, confirm all wiring gates pass, and emit the final `aif-gate-result` block.
