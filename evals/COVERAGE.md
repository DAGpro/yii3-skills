# Topic Guide Verification & Eval Coverage Matrix

> Real-time mapping between official `skills/yii3/references/` topic guides and behavioral test scenarios in `evals/scenarios/`.
> Validated deterministically via `node scripts/check-eval-coverage.mjs` and `node evals/runner/selftest.mjs`.

## 1. Metric Summary

| Metric | Value | Scope |
|---|---|---|
| **Total Reference Files** | 88 | All reference documents in `skills/yii3/references/` |
| **Catalogs & Navigation Indexes** | 2 | `INDEX.md`, `package-catalog.md` |
| **Evaluated Topic Guides** | 86 | Concrete architectural and implementation reference guides |
| **Covered Topic Guides** | 86 (100.0%) | Verified by >= 1 dedicated eval scenario with positive & negative samples |
| **Unbound Topic Guides** | 0 (0.0%) | Full coverage achieved across all evaluated topic guides |
| **Total Eval Scenarios** | 68 | Deterministic test fixtures with full check-suites and mutation canaries |

## 2. Complete Verification Matrix

| Topic Guide | Governing Scenario(s) | Layer | Positive Sample | Negative Sample | Runtime Verification | Status |
|---|---|---|---|---|---|---|
| `SKILL.md` (Core Entry Point) | [01](scenarios/01-full-add-comment), [02](scenarios/02-light-single-route), [04](scenarios/04-not-yii3-project), [05](scenarios/05-legacy-drift), [06](scenarios/06-convention-conflict), [08](scenarios/08-no-vendor-flag), [10](scenarios/10-yii2-trap), [12](scenarios/12-docs-only-task), [54](scenarios/54-yiisoft-library), [55](scenarios/55-aif-e2e-workflow), [66](scenarios/66-aif-idempotent-recovery), [68](scenarios/68-new-project-bootstrap) | composite, unit | Yes | Yes | php-lint, composer | **Covered** |
| `references/INDEX.md` | — | — | — | — | — | Catalog Index |
| `references/aif-adapter.md` | [55](scenarios/55-aif-e2e-workflow), [66](scenarios/66-aif-idempotent-recovery) | composite | Yes | Yes | php-lint, composer | **Covered** |
| `references/core-architecture-alignment.md` | [48](scenarios/48-architecture-layering), [55](scenarios/55-aif-e2e-workflow) | unit, composite | Yes | Yes | php-lint, composer | **Covered** |
| `references/core-config-tree.md` | [55](scenarios/55-aif-e2e-workflow) | composite | Yes | Yes | php-lint, composer | **Covered** |
| `references/core-definition-of-done.md` | [01](scenarios/01-full-add-comment), [55](scenarios/55-aif-e2e-workflow), [56](scenarios/56-qa-rector-cs-fixer) | composite, unit | Yes | Yes | php-lint, composer | **Covered** |
| `references/core-dependency-protocol.md` | [08](scenarios/08-no-vendor-flag), [56](scenarios/56-qa-rector-cs-fixer), [68](scenarios/68-new-project-bootstrap) | unit | Yes | Yes | php-lint, composer | **Covered** |
| `references/core-di-and-config.md` | [01](scenarios/01-full-add-comment), [03](scenarios/03-forgotten-di-binding), [07](scenarios/07-second-mechanism), [11](scenarios/11-console-command), [55](scenarios/55-aif-e2e-workflow), [66](scenarios/66-aif-idempotent-recovery) | composite, unit | Yes | Yes | php-lint, composer | **Covered** |
| `references/core-di-container.md` | [03](scenarios/03-forgotten-di-binding) | unit | Yes | Yes | php-lint, composer | **Covered** |
| `references/core-di-definitions.md` | [03](scenarios/03-forgotten-di-binding) | unit | Yes | Yes | php-lint, composer | **Covered** |
| `references/core-events-and-listeners.md` | [51](scenarios/51-domain-event-listener) | unit | Yes | Yes | php-lint, composer | **Covered** |
| `references/core-events-design.md` | [01](scenarios/01-full-add-comment), [06](scenarios/06-convention-conflict), [17](scenarios/17-event-listener-config), [55](scenarios/55-aif-e2e-workflow), [67](scenarios/67-transactional-outbox) | composite, unit | Yes | Yes | php-lint, composer | **Covered** |
| `references/core-events-reference.md` | [17](scenarios/17-event-listener-config) | unit | Yes | Yes | php-lint, composer | **Covered** |
| `references/core-feature-recipes.md` | [01](scenarios/01-full-add-comment), [55](scenarios/55-aif-e2e-workflow), [66](scenarios/66-aif-idempotent-recovery) | composite | Yes | Yes | php-lint, composer | **Covered** |
| `references/core-friendly-exceptions.md` | [41](scenarios/41-friendly-exception) | unit | Yes | Yes | php-lint, composer | **Covered** |
| `references/core-utilities-niche.md` | [53](scenarios/53-ip-allowlist) | unit | Yes | Yes | php-lint, composer | **Covered** |
| `references/core-utilities.md` | [46](scenarios/46-json-safe-encoding) | unit | Yes | Yes | php-lint, composer | **Covered** |
| `references/core-version-notes.md` | [01](scenarios/01-full-add-comment), [09](scenarios/09-outdated-api), [56](scenarios/56-qa-rector-cs-fixer) | composite, unit | Yes | Yes | php-lint, composer | **Covered** |
| `references/http-actions-and-controllers.md` | [20](scenarios/20-action-shape), [21](scenarios/21-controller-to-action) | unit | Yes | Yes | php-lint, composer | **Covered** |
| `references/http-actions-concerns.md` | [22](scenarios/22-action-pagination), [23](scenarios/23-composite-html-action) | unit, composite | Yes | Yes | php-lint, composer | **Covered** |
| `references/http-actions-core.md` | [01](scenarios/01-full-add-comment), [02](scenarios/02-light-single-route), [03](scenarios/03-forgotten-di-binding), [05](scenarios/05-legacy-drift), [13](scenarios/13-complex-action), [20](scenarios/20-action-shape), [55](scenarios/55-aif-e2e-workflow), [66](scenarios/66-aif-idempotent-recovery) | composite, unit | Yes | Yes | php-lint, composer | **Covered** |
| `references/http-cache-etag.md` | [40](scenarios/40-etag-conditional-get) | unit | Yes | Yes | php-lint, composer | **Covered** |
| `references/http-dataview-widgets.md` | [42](scenarios/42-dataview-listing) | unit | Yes | Yes | php-lint, composer | **Covered** |
| `references/http-file-handling.md` | [23](scenarios/23-composite-html-action) | composite | Yes | Yes | php-lint, composer | **Covered** |
| `references/http-forms-and-hydration.md` | [05](scenarios/05-legacy-drift), [13](scenarios/13-complex-action), [23](scenarios/23-composite-html-action), [25](scenarios/25-composite-auth-login) | unit, composite | Yes | Yes | php-lint, composer | **Covered** |
| `references/http-i18n-storage-and-locale.md` | [43](scenarios/43-locale-middleware) | unit | Yes | Yes | php-lint, composer | **Covered** |
| `references/http-i18n-translation-api.md` | [28](scenarios/28-translator-messages) | unit | Yes | Yes | php-lint, composer | **Covered** |
| `references/http-i18n-translation.md` | [28](scenarios/28-translator-messages) | unit | Yes | Yes | php-lint, composer | **Covered** |
| `references/http-middlewares.md` | [16](scenarios/16-middleware-registration), [23](scenarios/23-composite-html-action) | unit, composite | Yes | Yes | php-lint, composer | **Covered** |
| `references/http-openapi-endpoints.md` | [52](scenarios/52-swagger-setup) | unit | Yes | Yes | php-lint, composer | **Covered** |
| `references/http-openapi-setup.md` | [52](scenarios/52-swagger-setup) | unit | Yes | Yes | php-lint, composer | **Covered** |
| `references/http-openapi-swagger.md` | [52](scenarios/52-swagger-setup) | unit | Yes | Yes | php-lint, composer | **Covered** |
| `references/http-openapi-ui-and-ops.md` | [52](scenarios/52-swagger-setup) | unit | Yes | Yes | php-lint, composer | **Covered** |
| `references/http-routes-definition.md` | [01](scenarios/01-full-add-comment), [02](scenarios/02-light-single-route), [07](scenarios/07-second-mechanism), [09](scenarios/09-outdated-api), [13](scenarios/13-complex-action), [21](scenarios/21-controller-to-action), [22](scenarios/22-action-pagination), [55](scenarios/55-aif-e2e-workflow), [66](scenarios/66-aif-idempotent-recovery) | composite, unit | Yes | Yes | php-lint, composer | **Covered** |
| `references/http-routes-url-and-middleware.md` | [33](scenarios/33-url-generation) | unit | Yes | Yes | php-lint, composer | **Covered** |
| `references/http-routes.md` | [49](scenarios/49-route-group-middleware) | unit | Yes | Yes | php-lint, composer | **Covered** |
| `references/http-state.md` | [23](scenarios/23-composite-html-action), [25](scenarios/25-composite-auth-login) | composite | Yes | Yes | php-lint, composer | **Covered** |
| `references/http-validation-advanced.md` | [39](scenarios/39-conditional-validation) | unit | Yes | Yes | php-lint, composer | **Covered** |
| `references/http-validation-and-forms.md` | [32](scenarios/32-custom-validation-rule) | unit | Yes | Yes | php-lint, composer | **Covered** |
| `references/http-validation-custom-rules.md` | [32](scenarios/32-custom-validation-rule) | unit | Yes | Yes | php-lint, composer | **Covered** |
| `references/http-validation-rules.md` | [05](scenarios/05-legacy-drift), [13](scenarios/13-complex-action) | unit, composite | Yes | Yes | php-lint, composer | **Covered** |
| `references/http-views-and-widgets.md` | [37](scenarios/37-asset-bundle) | unit | Yes | Yes | php-lint, composer | **Covered** |
| `references/http-views-bootstrap5.md` | [62](scenarios/62-bootstrap5-widgets) | unit | Yes | Yes | php-lint, composer | **Covered** |
| `references/http-views-bulma.md` | [63](scenarios/63-bulma-widgets) | unit | Yes | Yes | php-lint, composer | **Covered** |
| `references/http-views-twig.md` | [36](scenarios/36-twig-view) | unit | Yes | Yes | php-lint, composer | **Covered** |
| `references/http-views.md` | [23](scenarios/23-composite-html-action) | composite | Yes | Yes | php-lint, composer | **Covered** |
| `references/http-widgets-and-assets.md` | [37](scenarios/37-asset-bundle) | unit | Yes | Yes | php-lint, composer | **Covered** |
| `references/infra-auth-and-rbac.md` | [24](scenarios/24-rbac-permission-check), [25](scenarios/25-composite-auth-login) | unit, composite | Yes | Yes | php-lint, composer | **Covered** |
| `references/infra-auth-jwt.md` | [34](scenarios/34-jwt-api-auth) | unit | Yes | Yes | php-lint, composer | **Covered** |
| `references/infra-auth-oauth2.md` | [50](scenarios/50-oauth2-github-login) | unit | Yes | Yes | php-lint, composer | **Covered** |
| `references/infra-auth-session.md` | [25](scenarios/25-composite-auth-login) | composite | Yes | Yes | php-lint, composer | **Covered** |
| `references/infra-commands.md` | [08](scenarios/08-no-vendor-flag), [11](scenarios/11-console-command) | unit | Yes | Yes | php-lint, composer | **Covered** |
| `references/infra-error-handling-ops.md` | [47](scenarios/47-error-log-listener) | unit | Yes | Yes | php-lint, composer | **Covered** |
| `references/infra-error-handling-web.md` | [19](scenarios/19-error-mapping) | unit | Yes | Yes | php-lint, composer | **Covered** |
| `references/infra-error-handling.md` | [19](scenarios/19-error-mapping) | unit | Yes | Yes | php-lint, composer | **Covered** |
| `references/infra-logging.md` | [26](scenarios/26-logging-structured) | unit | Yes | Yes | php-lint, composer | **Covered** |
| `references/infra-mailer-async-queue.md` | [31](scenarios/31-composite-mail-queue) | composite | Yes | Yes | php-lint, composer | **Covered** |
| `references/infra-mailer-transports.md` | [14](scenarios/14-mailer-notification) | unit | Yes | Yes | php-lint, composer | **Covered** |
| `references/infra-mailer.md` | [14](scenarios/14-mailer-notification) | unit | Yes | Yes | php-lint, composer | **Covered** |
| `references/infra-queue-brokers.md` | [15](scenarios/15-queue-job) | unit | Yes | Yes | php-lint, composer | **Covered** |
| `references/infra-queue-jobs.md` | [15](scenarios/15-queue-job), [31](scenarios/31-composite-mail-queue), [67](scenarios/67-transactional-outbox) | unit, composite | Yes | Yes | php-lint, composer | **Covered** |
| `references/infra-queue-mutex.md` | [35](scenarios/35-console-command-mutex), [67](scenarios/67-transactional-outbox) | unit, composite | Yes | Yes | php-lint, composer | **Covered** |
| `references/infra-rbac-storage.md` | [24](scenarios/24-rbac-permission-check) | unit | Yes | Yes | php-lint, composer | **Covered** |
| `references/infra-runners-and-runtimes.md` | [58](scenarios/58-runners-and-runtimes), [59](scenarios/59-roadrunner-worker), [60](scenarios/60-frankenphp-worker) | unit | Yes | Yes | php-lint, composer | **Covered** |
| `references/infra-runtime-frankenphp.md` | [60](scenarios/60-frankenphp-worker) | unit | Yes | Yes | php-lint, composer | **Covered** |
| `references/infra-runtime-roadrunner.md` | [59](scenarios/59-roadrunner-worker) | unit | Yes | Yes | php-lint, composer | **Covered** |
| `references/infra-state-resetter.md` | [61](scenarios/61-state-resetter) | unit | Yes | Yes | php-lint, composer | **Covered** |
| `references/infra-transactional-outbox.md` | [67](scenarios/67-transactional-outbox) | composite | Yes | Yes | php-lint, composer | **Covered** |
| `references/package-catalog.md` | — | — | — | — | — | Catalog Index |
| `references/persistence-active-record-relations.md` | [07](scenarios/07-second-mechanism) | unit | Yes | Yes | php-lint, composer | **Covered** |
| `references/persistence-active-record.md` | [07](scenarios/07-second-mechanism) | unit | Yes | Yes | php-lint, composer | **Covered** |
| `references/persistence-cache-drivers.md` | [18](scenarios/18-cache-hot-path) | unit | Yes | Yes | php-lint, composer | **Covered** |
| `references/persistence-caching.md` | [18](scenarios/18-cache-hot-path) | unit | Yes | Yes | php-lint, composer | **Covered** |
| `references/persistence-cycle-orm.md` | [30](scenarios/30-cycle-entity-persist) | unit | Yes | Yes | php-lint, composer | **Covered** |
| `references/persistence-cycle-schema-and-cli.md` | [30](scenarios/30-cycle-entity-persist) | unit | Yes | Yes | php-lint, composer | **Covered** |
| `references/persistence-db-connection-and-queries.md` | [03](scenarios/03-forgotten-di-binding) | unit | Yes | Yes | php-lint, composer | **Covered** |
| `references/persistence-db-readers-and-drivers.md` | [22](scenarios/22-action-pagination) | unit | Yes | Yes | php-lint, composer | **Covered** |
| `references/persistence-db.md` | [38](scenarios/38-db-query-builder) | unit | Yes | Yes | php-lint, composer | **Covered** |
| `references/persistence-migrations-operations.md` | [01](scenarios/01-full-add-comment) | composite | Yes | Yes | php-lint, composer | **Covered** |
| `references/persistence-migrations-schema.md` | [01](scenarios/01-full-add-comment), [07](scenarios/07-second-mechanism), [55](scenarios/55-aif-e2e-workflow), [66](scenarios/66-aif-idempotent-recovery) | composite, unit | Yes | Yes | php-lint, composer | **Covered** |
| `references/persistence-migrations.md` | [27](scenarios/27-migration-add-column) | unit | Yes | Yes | php-lint, composer | **Covered** |
| `references/testing-codeception.md` | [64](scenarios/64-codeception-tests) | unit | Yes | Yes | php-lint, composer | **Covered** |
| `references/testing-console.md` | [45](scenarios/45-console-testing) | unit | Yes | Yes | php-lint, composer | **Covered** |
| `references/testing-core.md` | [01](scenarios/01-full-add-comment), [55](scenarios/55-aif-e2e-workflow), [57](scenarios/57-mutation-testing-infection) | composite, unit | Yes | Yes | php-lint, composer | **Covered** |
| `references/testing-database.md` | [44](scenarios/44-database-testing) | unit | Yes | Yes | php-lint, composer | **Covered** |
| `references/testing-http.md` | [29](scenarios/29-functional-test) | unit | Yes | Yes | php-lint, composer | **Covered** |
| `references/testing-infection.md` | [57](scenarios/57-mutation-testing-infection) | unit | Yes | Yes | php-lint, composer | **Covered** |
| `references/testing-psr-doubles.md` | [01](scenarios/01-full-add-comment) | composite | Yes | Yes | php-lint, composer | **Covered** |
| `references/testing-testo.md` | [65](scenarios/65-testo-runner) | unit | Yes | Yes | php-lint, composer | **Covered** |

## 3. Unbound Guides Gap Analysis (100% Coverage Achieved)

All **86** evaluated topic guides (across **88** reference files) have **100.0% coverage** across **68** eval scenarios (`0` unbound guides). Roadmap P3 scenarios (`58–65`) and post-audit expansion scenarios (`66–68`) close all specialized runtime, UI, workflow, outbox, and bootstrap gaps:

| # | Scenario | Layer | Bound Guides | Status |
|---|---|---|---|---|
| 1 | [58-runners-and-runtimes](scenarios/58-runners-and-runtimes) | unit | `references/infra-runners-and-runtimes.md` | **Covered** |
| 2 | [59-roadrunner-worker](scenarios/59-roadrunner-worker) | unit | `references/infra-runtime-roadrunner.md`, `references/infra-runners-and-runtimes.md` | **Covered** |
| 3 | [60-frankenphp-worker](scenarios/60-frankenphp-worker) | unit | `references/infra-runtime-frankenphp.md`, `references/infra-runners-and-runtimes.md` | **Covered** |
| 4 | [61-state-resetter](scenarios/61-state-resetter) | unit | `references/infra-state-resetter.md` | **Covered** |
| 5 | [62-bootstrap5-widgets](scenarios/62-bootstrap5-widgets) | unit | `references/http-views-bootstrap5.md` | **Covered** |
| 6 | [63-bulma-widgets](scenarios/63-bulma-widgets) | unit | `references/http-views-bulma.md` | **Covered** |
| 7 | [64-codeception-tests](scenarios/64-codeception-tests) | unit | `references/testing-codeception.md` | **Covered** |
| 8 | [65-testo-runner](scenarios/65-testo-runner) | unit | `references/testing-testo.md` | **Covered** |
| 9 | [66-aif-idempotent-recovery](scenarios/66-aif-idempotent-recovery) | composite | `SKILL.md`, `references/aif-adapter.md`, `references/core-feature-recipes.md`, `references/core-di-and-config.md`, `references/http-routes-definition.md`, `references/http-actions-core.md`, `references/persistence-migrations-schema.md` | **Covered** |
| 10 | [67-transactional-outbox](scenarios/67-transactional-outbox) | composite | `references/infra-transactional-outbox.md`, `references/core-events-design.md`, `references/infra-queue-jobs.md`, `references/infra-queue-mutex.md` | **Covered** |
| 11 | [68-new-project-bootstrap](scenarios/68-new-project-bootstrap) | unit | `SKILL.md`, `references/core-dependency-protocol.md` | **Covered** |

## 4. Verification Command

To re-verify that all declared guides exist and compute live coverage metrics:

```bash
node scripts/check-eval-coverage.mjs
```
