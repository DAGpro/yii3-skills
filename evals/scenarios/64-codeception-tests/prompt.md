# Prompt: Configure Codeception 5 Test Suite

Configure Codeception 5 for API testing:
1. Require `codeception/codeception` in `require-dev` (never in `require`).
2. Create `codeception.yml` root configuration.
3. Configure `tests/Api.suite.yml` with the REST module.
4. Implement an actor-driven Cest test `tests/Api/UserApiCest.php` using `ApiTester`.
