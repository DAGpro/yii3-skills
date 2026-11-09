# Rubric: Idempotent Recovery and Resumption

## 1. Idempotency and Non-Duplication (Pass/Fail)
- The solution checks existing project files before creating new ones.
- Existing migrations are not duplicated or superseded by a redundant table creation.
- Existing DI bindings in `config/common/di/order.php` are respected and not redundantly duplicated in `config/web/di/`.
- Routes are added cleanly without duplicating existing paths.

## 2. Yii 3 Framework Idioms (Pass/Fail)
- `CancelOrderAction` is a thin HTTP transport adapter returning `ResponseInterface`.
- Persistence is handled via `OrderRepositoryInterface`, not directly inside the action.
- Input data is validated via DTO attributes (`#[Required]`, `#[Length]`, etc.).
- No legacy Yii 2 constructs (`Yii::$app`).

## 3. Verification and Handoff (Pass/Fail)
- Emits a well-formed `aif-gate-result` JSON block conforming to AI Factory 2.x specification.
