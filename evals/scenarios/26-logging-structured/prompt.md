Support keeps reporting that invoice downloads just show "export failed" and nobody can tell why: InvoiceExporter catches every exception and silently returns null, leaving no trace at all.

Add structured logging to InvoiceExporter:
- Inject the PSR-3 logger interface through the constructor (depend on the interface, not on a concrete logger class).
- Whenever an export fails, log a warning with structured context that includes the operation name and the invoice id, so failures can be filtered and correlated later.
- Register a file log target in config so those warnings are written to runtime/logs/app.log (yiisoft/log and yiisoft/log-target-file are already required in composer.json).
