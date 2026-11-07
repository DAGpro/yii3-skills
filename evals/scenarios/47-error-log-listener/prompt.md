When an unhandled error happens in production we have no trace of it: nothing about the failure ever ends up in the application log, it just disappears.

Wire up error logging the way our conventions prescribe: listen for the framework's application-error event and write the throwable into the application log with its class, message, and a stack trace. The PSR-3 logger is already configured in this app; make sure the new wiring actually fires at runtime - if the component that catches unhandled errors never emits the event, the listener is dead code.
