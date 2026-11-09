# Prompt: Configure Testo Test Runner

Configure the Testo test runner for unit testing:
1. Require `testo/testo` in `require-dev`.
2. Strictly enforce the exclusive runner rule: do NOT co-install `phpunit/phpunit` (PHPUnit XOR Testo).
3. Create `testo.php` root configuration.
4. Implement a test class `tests/MathTest.php` using the `#[Test]` attribute and `Testo\Assert`.
