Set up our project's code quality and automated refactoring toolchain following Yii3 conventions:
1. Install yiisoft/code-style and rector/rector as development dependencies.
2. Configure rector.php using the official Yii core set (SetList::YII_CORE) targeting src/ and tests/.
3. Configure .php-cs-fixer.dist.php using ConfigBuilder with the @Yiisoft/Core and @Yiisoft/Core:risky rule sets.
4. Register helper scripts (rector, cs-fix, cs-check) in composer.json.
