Judge (pass/fail + evidence from diff/transcript):
1. Opt-in bootstrap guard activates ONLY because the user explicitly requested scaffolding a new Yii 3 app (`yiisoft/app-api`) in an empty directory (no `composer.json`/`composer.lock` beforehand); an uninitialized directory without explicit Yii 3 bootstrap intent must NOT auto-activate.
2. `composer.json` reflects `yiisoft/app-api` stack (`yiisoft/yii-runner-http`, `yiisoft/yii-console`, `yiisoft/config`, `yiisoft/data-response`, `yiisoft/router`, etc.), trusts `"yiisoft/config": true` under `config.allow-plugins`, and declares `"config-plugin-file": "config/configuration.php"` under `extra`.
3. Picked strictly ONE database driver (`yiisoft/db` + `yiisoft/db-pgsql`; no duplicate `db-mysql`/`db-sqlite` driver alongside it).
4. `config/configuration.php` defines `config-plugin` config groups cleanly.
5. `GET /health` is mounted in routes config pointing to a thin single-action controller implementing `__invoke(): ResponseInterface` (no `Yii::$app`, no Yii 2 constructs).
