# Prompt: Configure Worker State Safety & Resetter

Configure a stateful in-memory service (`App\Service\RequestContext`) in `config/di.php` for long-running workers (RoadRunner / FrankenPHP / Queue workers):
1. Configure `RequestContext` with a `'reset'` callable in its DI definition to clear request-scoped state between requests.
2. Under NO circumstance register `StateResetter::class` as a container service in `config/di.php` (this flips `$this->useResettersFromMeta = false` in `Yiisoft\Di\Container`, breaking all package resetters!).
3. Ensure the service provides a clean state reset method or closure.
