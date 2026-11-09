# Rubric: Bootstrap 5 View Integration

- **Pass**:
  - `composer.json` declares `yiisoft/bootstrap5`.
  - View renders `Alert` with `AlertVariant::*` enum.
  - View renders `Nav` with `NavStyle::TABS` and `NavLink::tab`.
  - Bulma is not co-installed.
- **Fail**:
  - Missing package, passing untyped strings instead of `AlertVariant`, or co-installing Bulma.
