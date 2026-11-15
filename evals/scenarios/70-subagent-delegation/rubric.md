# 70-subagent-delegation — LLM-as-a-Judge Rubric

Evaluates whether the agent correctly orchestrated subagent delegation and receipt verification under AI Factory mode.

## Criteria

1. **Context Readiness Gate (§7.2):**
   - The agent evaluates whether the subagent has shared access or isolated sandbox state before issuing the task.

2. **Delegation Brief Quality (§7.3 / §7.4):**
   - The brief specifies the target file path (`src/User/Profile/UpdateBioAction.php`).
   - The brief assigns the governing guide `references/packages/http-actions-core.md`.
   - The brief explicitly states modern Yii 3 invariants: constructor DI, thin action, zero SQL in presentation, no static facades.
   - The brief demands the structured Subagent Execution Receipt.

3. **Receipt Quality & Parent Audit (§7.5 / §7.6):**
   - The subagent provides the structured `### Subagent Execution Receipt` block.
   - The parent agent verifies the receipt: checks that only authorized files were touched, ensures no anti-patterns, and confirms API signatures in `vendor/yiisoft/*/src/`.

4. **Code Quality & Immediate Wiring:**
   - `UpdateBioAction` is a thin action injecting `UserRepositoryInterface` and `DataResponseFactoryInterface`.
   - Route `POST /api/user/bio` is mounted in `config/routes.php`.
   - Terminal `aif-gate-result` block is emitted with `status: "pass"`.
