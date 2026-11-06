Judge (pass/fail + evidence from the diff/transcript):
1. One single-action class per endpoint: final readonly class with __invoke() returning ResponseInterface; named IndexAction (serves /) and StatsAction (serves /stats); placed in App\Web\Site; style consistent with the existing ShowPostAction.
2. Routes re-pointed: config/web/routes.php no longer wires [SiteController::class, 'actionX'] callables; the new action classes are passed as route actions (action: named argument or ->action()), not as the 2nd positional constructor argument (that binds to $name on router 4.0.x).
3. Behavior preserved: / returns the app info array and /stats the stats summary, via the same services and Yiisoft\DataResponse\ResponseFactory\DataResponseFactoryInterface (not the deprecated root Yiisoft\DataResponse\DataResponseFactoryInterface).
4. The legacy controller-style structure is not propagated: no new controller classes with action methods, no multi-method controller kept wired; the legacy SiteController ends up unreferenced (leftover dead code noted as a plus if removed).
5. No Yii2 constructs, no global static state (Yii::$app), dependencies injected via constructors.
6. The report flags APIs as verified against sources or "not verified against sources" (vendor/ is absent; composer.lock is a stub).
