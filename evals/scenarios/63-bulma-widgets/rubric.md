# Rubric: Bulma View Integration

- **Pass**:
  - `composer.json` declares `yiisoft/yii-bulma`.
  - View renders `ProgressBar` with `ProgressBar::COLOR_*` constants.
  - View renders `Tabs` with `Tabs::STYLE_*` and associative arrays.
  - Bootstrap 5 is not co-installed.
- **Fail**:
  - Missing package, missing styling constants, or co-installing Bootstrap 5.
