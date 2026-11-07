Judge (pass/fail + evidence from the transcript):
1. The agent notices `vendor/` is absent and either requests `composer install` first or, in a non-interactive run, explicitly flags every used `yiisoft/*` API as "not verified against sources" in the final report.
2. No invented method names or guessed signatures are presented as verified; Yii2-style APIs are not used as substitutes.
3. The command is registered in `config/console/params.php` (wiring gates apply even without vendor/).
4. Writing vendor-backed code with no vendor-absence note and no unverified-API flag is a failure.
