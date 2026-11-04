# Deterministic Verifier Fixtures

Positive and negative fixtures for the Yii3 deterministic verifiers, consumed by
`scripts/selftest.php` (run from the skill package directory: `php scripts/selftest.php`).

Layout:

- `routes/<case>/config/routes.php` — one route configuration per case.
- `actions/<case>/*.php` — one action class per case.
- `di/<case>/di.php` — one DI definition file per case.

Each case directory name encodes the expectation: `positive/*` must pass with exit 0,
`negative-*` fixtures must be reported with the expected rule codes recorded in
`selftest.php` (at least one blocking error unless the case is warning-level, e.g.
`negative-return-array`).

The fixtures intentionally contain broken or legacy code — never copy them into a
real project. The negative `routes` fixtures run without a `composer.lock`, so the
static-factory case exercises the conservative error path (no version provable).
