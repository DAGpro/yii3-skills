# Rubric: StateResetter & Worker State Safety

- **Pass**:
  - `config/di.php` does NOT define `StateResetter::class` as a service key.
  - Stateful service definition contains a `'reset'` callable or implements `ResetInterface`.
  - State reset clears internal properties preventing memory leaks and cross-request state bleeding.
- **Fail**:
  - Defining `StateResetter::class` directly in DI config (the catastrophic trap).
  - Omitting reset logic on stateful long-running worker service.
