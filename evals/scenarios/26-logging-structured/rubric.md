Judge (pass/fail + evidence from the diff/transcript):
1. The exporter depends on `Psr\Log\LoggerInterface` via constructor injection - not the concrete `Yiisoft\Log\Logger`, no static/facade access, no logger created inline with `new Logger(...)` inside the service.
2. The warning is logged on the failure path itself (inside the catch), not before the try, not after the method returns, and not in the caller action only.
3. The context is structured: an array with the operation name and the invoice id (plus ideally the exception under `'exception'`), so the record is filterable - a flat string-concatenated message like "Invoice 42 failed" with no context array does not satisfy "structured".
4. The config actually composes a working pipeline: `LoggerInterface::class` bound to the logger implementation with the file target in its targets (yiisoft/log ships no DI config - the application owns the binding), and the target file resolved to runtime/logs/app.log. A config file nobody loads (not merged into the app config) fails.
5. No debug leftovers: error_log(), echo/var_dump debugging, or logging added to the action instead of the service.
