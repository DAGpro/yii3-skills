Add a custom PSR-15 middleware that assigns a request id to every request: read the `X-Request-Id` header or generate a new id when it is missing, expose it to downstream handlers as a request attribute, and echo it back on the outgoing response.
Register the middleware in the global application middleware stack so it runs for every request.
