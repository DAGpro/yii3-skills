# Prompt: Configure Bootstrap 5 Views & Widgets

Render Bootstrap 5 components in `views/site/index.php`:
1. Require `yiisoft/bootstrap5` in `composer.json`.
2. Render `Alert::widget()` using the typed `AlertVariant` enum (e.g. `AlertVariant::WARNING`).
3. Render tab navigation using `Nav::widget()` with `styles(NavStyle::TABS)` and `NavLink::tab(...)`.
4. Comply with the exclusive CSS-driver rule: do not install `yiisoft/yii-bulma`.
