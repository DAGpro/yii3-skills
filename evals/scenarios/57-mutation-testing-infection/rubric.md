Judge (pass/fail + evidence from the diff/transcript):
1. Development packages: `infection/infection` and `roave/infection-static-analysis-plugin` are added to `require-dev` in `composer.json` (guide core-dependency-protocol.md: never place tooling/linters in runtime require).
2. Plugin installer allowed: `config.allow-plugins` in `composer.json` has `"infection/extension-installer": true` (testing-infection.md §1.2).
3. Canonical configuration: `infection.json.dist` (or `infection.json5`/`infection.json`) exists, configures `"source": { "directories": ["src"] }`, `"mutators": { "@default": true }`, and logs (testing-infection.md §1.3).
4. MSI threshold: either configured in `minMsi`/`minCoveredMsi` in `infection.json.dist` or registered in `composer.json` under `scripts.infection` with `--min-msi=...` (testing-infection.md §1.5).
5. Zero Yii2 constructs; strict types declared in all added PHP files.
