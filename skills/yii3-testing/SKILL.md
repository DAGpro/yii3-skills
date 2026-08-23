---
name: yii3-testing
description: >-
  Write tests for Yii3 applications using the template's Codeception setup (PHPUnit assertions):
  Unit, Functional, Web and Console suites. Knows when to use each suite, how to run tests locally
  and in Docker. Use when user says "write tests", "test this action", "add test", "coverage" in a Yii3 project.
argument-hint: "[what to test]"
allowed-tools: Read Glob Grep Write Edit Bash(vendor/bin/codecept *; make test *; make codecept *; php -l *) AskUserQuestion Questions
disable-model-invocation: false
metadata:
  author: DAGpro (https://github.com/DAGpro)
  version: "0.1"
  category: framework-yii3
---

# Yii3 Testing

Write and run tests for a Yii3 application. The application templates ship a ready Codeception setup.

## Suite Selection Guide

| Suite        | Use for                                                    | Examples                                             |
|--------------|------------------------------------------------------------|------------------------------------------------------|
| `Unit`       | isolated classes, no framework boundary                    | value objects, validators, domain services, UseCases |
| `Functional` | code needing DI/routing/middleware in the same PHP process | actions, form flows                                  |
| `Web`        | behavior through a real HTTP server                        | status codes, redirects, cookies, rendered pages     |
| `Console`    | console commands                                           | `src/Console` commands                               |

Rule of thumb: **unit-test the UseCase/service layer, functionally-test actions**.
`WebViewRenderer` and `FormHydrator` are final classes — do not mock them; cover them via functional tests.

## Running Tests

```sh
# Locally (APP_ENV=test is required)
vendor/bin/codecept build          # after install / suite changes
APP_ENV=test composer test         # all suites
APP_ENV=test vendor/bin/codecept run Functional HomePageCest

# Docker
make codecept build
make test            # all
make test Functional # one suite
```

## Step 0: Analyze

1. Load context per `yii3` master skill.
2. Detect the harness: check `codeception.yml`, `tests/*.suite.yml`, existing Cests in `tests/`.
   If the project uses plain PHPUnit instead of Codeception, follow project conventions.
3. Identify what to test and pick the suite per the table above.

## Unit Test — Service / UseCase

```php
<?php

declare(strict_types=1);

namespace App\Tests\Unit\Web\Post;

use App\Web\Post\Post;
use App\Web\Post\PostRepositoryInterface;
use App\Web\Post\CreatePost;
use PHPUnit\Framework\TestCase;

final class CreatePostTest extends TestCase
{
    public function testSavesPostWithGeneratedSlug(): void
    {
        $saved = [];
        $repository = $this->createMock(PostRepositoryInterface::class);
        $repository->method('save')->willReturnCallback(
            static function (Post $post) use (&$saved): void { $saved[] = $post; }
        );

        (new CreatePost($repository))->execute('Hello World', 'Text');

        $this->assertCount(1, $saved);
        $this->assertSame('hello-world', $saved[0]->slug);
    }
}
```

Mock only interfaces (`*RepositoryInterface`, PSR interfaces, your own contracts).
Never mock or anonymous-implement framework final classes.

## Functional Test — Action

The template's `Functional` suite runs the app in-process: `App\Tests\Support\FunctionalTester`
sends PSR-7 requests through `HttpApplicationRunner::runAndGetResponse()`.

```php
<?php

declare(strict_types=1);

namespace App\Tests\Functional\Web\Post;

use App\Tests\Support\FunctionalTester;
use HttpSoft\Message\ServerRequest;

use function PHPUnit\Framework\assertSame;
use function PHPUnit\Framework\assertStringContainsString;

final class CreatePostActionCest
{
    public function rendersFormOnGet(FunctionalTester $tester): void
    {
        $response = $tester->sendRequest(new ServerRequest(uri: '/post/create'));

        assertSame(200, $response->getStatusCode());
        assertStringContainsString('<form', $response->getBody()->getContents());
    }

    public function createsPostOnValidSubmit(FunctionalTester $tester): void
    {
        $response = $tester->sendRequest(
            (new ServerRequest(uri: '/post/create', method: 'POST'))
                ->withHeader('Content-Type', 'application/x-www-form-urlencoded')
                ->withParsedBody(['PostForm' => ['title' => 'Hello', 'text' => 'World']]),
        );

        assertSame(302, $response->getStatusCode());
    }
}
```

For `Web` suite tests use PhpBrowser actor methods (`$I->amOnPage()`, `$I->submitForm()`,
`$I->seeResponseCodeIs()`). Adapt to the project's generated `Support/*Tester.php`.

## Console Test

```php
final class WarmUpStatsCommandCest
{
    public function runsSuccessfully(ConsoleTester $I): void
    {
        $I->runShellCommand('./yii stats:warm-up 7');
        $I->seeResultCodeIs(0);
    }
}
```

## Debug Panel (dev tooling)

Development-time inspection of requests, container, events, logs and DB queries.

```sh
composer require --dev yiisoft/yii-debug
composer require --dev yiisoft/yii-debug-toolbar
```

- Dev-only: gate behind `Environment::appDebug()`; never in production (`yii3-hardening`).
- Packages ship config-plugin files merged by `yiisoft/config`; after config changes run
  `composer yii-config-rebuild`. Ensure collectors register only for dev/test environments.
- Panels show timeline, DI container state, dispatched events, logs, DB queries with timings -
  spot N+1 and slow queries before profiling (`/yii3-hardening`).
- Workflow: slow page -> sort queries by time; event not firing -> check listeners panel;
  service resolution errors -> inspect container definitions first.

## References

- **references/ENVIRONMENT-SETUP.md** - composer/codeception.yml/suite files, test params, state reset, coverage.
- **references/QUALITY-TOOLS.md** - psalm, dependency analyser, cs-fixer, rector, pre-PR checklist.
- **references/END-TO-END.md** - when Web tests are worth it, Cest examples.

## CI

Ready-to-use GitHub Actions pipeline (PHP matrix, composer cache, codecept run):
see **references/CI-WORKFLOW.md**.

## Verification Checklist

1. New tests pass: run the specific suite, then the full run before finishing.
2. No new warnings/deprecations introduced in output.
3. Static analysis still passes if configured (psalm/phpstan — see guide "Static Analysis").
4. Test names describe behavior, not implementation.
