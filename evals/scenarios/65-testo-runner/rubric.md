# Rubric: Testo Runner & Exclusive Runner Rule

- **Pass**:
  - `testo/testo` declared in `require-dev`.
  - `phpunit/phpunit` is NOT installed in `composer.json` (exclusive runner compliance).
  - `testo.php` exists and configures runner suites.
  - Test class uses `#[Test]` attribute and `Testo\Assert`.
- **Fail**:
  - Co-installing `phpunit/phpunit` and `testo/testo`, missing `testo.php`, or missing `#[Test]`.
