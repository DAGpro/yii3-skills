# Plan: Enable PSR-16 cache service

## Context
`yiisoft/cache-file` is installed; its package config plugin auto-configures
`Yiisoft\Cache\File\FileCache` (`cachePath` resolved from `@runtime/cache`).
The PSR-16 consumer interface is not bound yet.

## Tasks
- [x] Install `yiisoft/cache` + `yiisoft/cache-file` via composer.
- [ ] Bind the PSR-16 consumer interface `Psr\SimpleCache\CacheInterface::class` to
      `FileCache::class` in `config/common/di/cache.php` (the adapter itself is
      auto-configured by the package plugin — do not duplicate its definition).

### Execution State
- **Stage:** Stage 6 — Config Audit & Wiring Gate
- **Status:** IN PROGRESS
- **Artifacts:**
  - `composer.json` (Dependency declaration)
- **Wiring Gates:**
  - DI binding: PENDING
- **Verification:**
  - Syntax / Project Checks: NOT RUN
  - Unit / HTTP Tests: NOT RUN
- **Open Issues:** None
- **Next Stage:** Finale
