Judge (pass/fail + evidence from the diff/transcript):
1. Development packages: `yiisoft/code-style` and `rector/rector` are added to `require-dev` in `composer.json` (guide core-dependency-protocol.md: never place tooling/linters in runtime require).
2. Rector configuration: `rector.php` exists at root, configures `src/` and `tests/` paths, and imports `Yiisoft\CodeStyle\Rector\SetList::YII_CORE` (enforces Yii3 conventions such as avoiding `#[Override]`).
3. PHP CS Fixer configuration: `.php-cs-fixer.dist.php` exists, uses `Yiisoft\CodeStyle\ConfigBuilder::build()`, enables `@Yiisoft/Core` and `@Yiisoft/Core:risky`, and attaches a Finder scanning `src/` and `tests/`.
4. Composer scripts: `composer.json` registers `rector` (`rector`), `cs-fix` (`php-cs-fixer fix`), and `cs-check` (`php-cs-fixer fix --dry-run`).
5. Zero Yii2 constructs or deprecated static facades; strict types declared in all added PHP files.
