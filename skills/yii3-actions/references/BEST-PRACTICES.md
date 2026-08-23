# Yii3 Action Generator — Best Practices Reference

Supplement to SKILL.md. Load when generating actions.

## Error Handling

```php
try {
    $this->createUser->execute($form);
    $this->logger->debug('User created');
    return $this->responseFactory
        ->createResponse(Status::SEE_OTHER)
        ->withHeader('Location', $this->urlGenerator->generate('users'));
} catch (\RuntimeException $e) {
    $this->logger->warning('Create failed: {error}', ['error' => $e->getMessage()]);
}
```

## Logging Levels

```php
$this->logger->debug('{action} invoked', ['action' => 'CreateUserAction']);      // Entry point
$this->logger->info('{entity} created (id={id})', ['entity' => 'User', 'id' => 7]); // Success
$this->logger->warning('{action} failed: {error}', ['action' => 'CreateUserAction', 'error' => $e->getMessage()]);
$this->logger->error('{action} exception', ['action' => 'CreateUserAction', 'exception' => $e]);
```

Every PSR-3 placeholder must have a matching context key — placeholders without context are
logged literally. Never log secrets or full PII.

## Security Checklist

- [ ] CSRF token in all POST forms: `Html::form()->post($urlGenerator->generate($route))->csrf($csrf)` (requires `CsrfViewInjection`)
- [ ] Validate all user input via FormModel or Validator
- [ ] Check HTTP method explicitly when an action serves several verbs
- [ ] Use `CurrentRoute::getArgument()` for route params (they are not request attributes)
- [ ] Never expose stack traces in production
- [ ] Sanitize output: `Html::encode()`
- [ ] Deletion and other mutations only via POST/DELETE, never GET

## Performance Tips

- `DataReader` + `OffsetPaginator` for lazy pagination
- Eager load relations / avoid N+1 queries
- Cache expensive queries with PSR-16 (`yiisoft/cache`)
- Stream large downloads instead of building strings in memory

See `/yii3-hardening` for the full optimization guide.

## Package Quick Reference

| Package                   | Purpose                              | See                                                                        |
|---------------------------|--------------------------------------|----------------------------------------------------------------------------|
| yiisoft/input-http        | Request hydration (`#[FromBody]`)    | PATTERNS.md "Input DTO Pattern"; API.md "Request Input"                    |
| yiisoft/form-model        | Form models, FormHydrator, Field     | PATTERNS.md "Complete CRUD"                                                |
| yiisoft/form              | Widget-based forms, Bootstrap themes | PATTERNS.md "GridView" section                                             |
| yiisoft/validator         | Standalone validation                | PATTERNS.md "Complete CRUD"; full catalog in `/yii3-forms` skill |
| yiisoft/data-response     | JSON/XML responses with negotiation  | API.md "Response Factory & Presenters"                                     |
| yiisoft/session           | Session + flash messages             | PATTERNS.md "Session + Flash Pattern"                                      |
| yiisoft/response-download | File downloads                       | PATTERNS.md "File Download Pattern"                                        |
| yiisoft/data              | DataReader, pagination, sorting      | PATTERNS.md "List Action"                                                  |
| yiisoft/html              | HTML helper                          | PATTERNS.md "HTML Helper"                                                  |
| yiisoft/widget            | Custom widgets                       | PATTERNS.md "Widget Pattern"                                               |
| yiisoft/yii-dataview      | GridView, DataGrid                   | PATTERNS.md "GridView"                                                     |
| yiisoft/view              | View rendering                       | PATTERNS.md "View Renderer"                                                |

## Anti-Patterns to Avoid

- ❌ Using `Yii::$app` (Yii2 pattern)
- ❌ Business logic in templates
- ❌ Direct SQL in actions (use repositories)
- ❌ Mutable classes (use `final readonly`)
- ❌ Missing `declare(strict_types=1)`
- ❌ Using float for money (use cents)
- ❌ Skipping error handling in try/catch
- ❌ Hardcoding URLs (use `UrlGeneratorInterface`)
- ❌ Accessing `$_GET`/`$_POST` directly (use `ServerRequestInterface`)
- ❌ Creating services in actions (use DI)
