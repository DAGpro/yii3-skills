# End-to-end Testing

Codeception Web suite drives a real browser through a running application — use for flows that
cannot be covered by functional tests (JS behavior, multi-page journeys). Environment setup details:
guide "Testing / Environment setup".

## When to Use

| Level         | Covers                                                             |
|---------------|--------------------------------------------------------------------|
| Unit          | services/domain in isolation (`yii3-testing`)                      |
| Functional    | request -> route -> action -> response without browser             |
| **Web (E2E)** | real HTTP + browser interaction, JS, cookies/sessions across pages |

## Typical Scenarios Worth E2E Tests

1. Signup -> login -> restricted page access (auth journey).
2. Form submit with client-side validation + server fallback.
3. Flash message visible after redirect, gone after reload.
4. Admin CRUD table interactions that rely on JS widgets.

## Structure

```php
use Codeception\Attribute\Group;

final class AuthCest
{
    public function loginSuccessfully(WebTester $I): void
    {
        $I->amOnPage('/login');
        $I->fillField('email', 'user@example.com');
        $I->fillField('password', 'secret');
        $I->click('Sign in');
        $I->seeCurrentUrlEquals('/profile');
        $I->see('Welcome');
    }

    public function flashAfterCreate(WebTester $I): void
    {
        $I->amOnPage('/posts/new');
        // ... fill and submit ...
        $I->see('Post created');          // flash on next page
        $I->amOnPage('/posts');           // after reload it is gone
    }
}
```

## Rules

- Keep E2E suite small and slow-path only; push coverage down to unit/functional.
- Each Cest scenario must be independent (no shared mutated state); reset DB between tests.
- Run locally via `make test -- Web` (Docker) — see CI-WORKFLOW.md for pipeline integration.
- Do not assert on volatile markup (auto-generated ids/classes); use semantic selectors.
