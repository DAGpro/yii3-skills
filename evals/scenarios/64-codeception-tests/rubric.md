# Rubric: Codeception 5 Testing

- **Pass**:
  - `codeception/codeception` declared in `require-dev`.
  - `codeception.yml` root config exists.
  - `tests/Api.suite.yml` configures REST module.
  - Cest test uses `ApiTester $I`.
- **Fail**:
  - Missing package, placing in runtime `require`, or missing `codeception.yml`.
