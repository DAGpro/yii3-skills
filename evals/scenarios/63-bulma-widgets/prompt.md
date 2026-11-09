# Prompt: Configure Bulma Views & Widgets

Render Bulma components in `views/site/index.php`:
1. Require `yiisoft/yii-bulma` in `composer.json`.
2. Render `ProgressBar::widget()` using class constants (e.g. `ProgressBar::COLOR_SUCCESS`).
3. Render `Tabs::widget()` with `Tabs::STYLE_BOX` and associative array items (`[['label' => '...', ...]]`).
4. Comply with the exclusive CSS-driver rule: do not install `yiisoft/bootstrap5`.
