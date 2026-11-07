We're standardizing our blog templates on Twig. Convert the post page view (`views/post/show.php`) to a Twig template and render it through the twig renderer, so the page keeps the same HTML output. The escaping should rely on Twig's autoescaping instead of the manual `htmlspecialchars` calls currently sprinkled in the template.

Both `yiisoft/view-twig` and `yiisoft/yii-twig` are already required in composer.json.
