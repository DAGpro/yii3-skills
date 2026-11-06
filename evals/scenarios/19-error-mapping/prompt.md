POST /api/subscribe throws App\Domain\Subscription\EmailAlreadySubscribedException when the email is already subscribed. Right now that surfaces as an unformatted 500 HTML error page.

Map the domain exception to a proper API error response:
- Register it in the ExceptionResponder exceptionMap so the client gets a 409 (Conflict) response.
- The mapped response body must be machine-readable JSON in ProblemDetails style with the members: type, title, status, detail, sent with Content-Type application/problem+json. No stack traces, file paths or debug output.
- Wire the ExceptionResponder middleware into the global pipeline in config: ErrorCatcher stays the outermost middleware, ExceptionResponder sits inside it (before the Router).
- Keep the action itself free of try/catch error mapping.
