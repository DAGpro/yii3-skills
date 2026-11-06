Emit a domain event when a post is published: create an immutable event class carrying the post id, dispatch it from the PublishPost service after the post is saved, and handle it with a dedicated listener class that writes an audit log entry.
Register the listener in the event configuration group so it actually fires at runtime.
