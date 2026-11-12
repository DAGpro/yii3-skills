# Check contracts (audit P1, 2026-11-12)

Per-check contracts for the semantically upgraded checks, per the external-audit
recommendation (§5.1): each check is an engineering artifact with a declared invariant,
evidence type, and criticality — not an ad-hoc regex. Levels follow the audit's model:
**L1** structural presence, **L2** semantic relation (static), **L3** runtime proof.
L2 can never substitute L3; the L3 boundary of every check is stated explicitly and is
covered by the L5 runtime harness (`evals/runtime-harness/`, CI `php-runtime-gates`).

## `event-after-commit` / `dispatch-after-commit` — `dispatchAfterCommitCheck()`

| Field | Content |
|---|---|
| Invariant | The domain event fires only after the transaction completes: not inside the `transaction()` closure and not before it begins, within each co-located method scope |
| Type | L2 (call-order analysis over comment/string-stripped source, escape- and heredoc-aware) |
| Positive cases | dispatch after `transaction()` returns (same method); layered solution — transaction in the repository, dispatch in the use case (no co-located scope; pinned by `01/positive-alt-layered`) |
| Negative cases | dispatch inside the closure (pinned: negative sample, mutation `dispatch-inside-transaction`); dispatch before the transaction begins (pinned: `01/near-miss-dispatch-before`, mutation `dispatch-before-transaction`) |
| Evidence | Static: closure-span + position order per method. Not proven statically: that the transaction actually commits before the dispatch at runtime |
| L3 boundary | PHPUnit integration test with a forced rollback: rollback/exception inside the closure ⇒ event not received. `runtime-harness` verifies transaction + outbox dispatch ordering on a real DB |
| Criticality | Blocking (required) |
| Skip policy | No skip for release benchmarks |

## `interface-bound` — `interfaceBoundCheck({ stemMatch })`

| Field | Content |
|---|---|
| Invariant | Every added interface is bound in a DI binding position (array key ⇒ class target, or Reference chain) to a concrete class; dummy targets (`\stdClass`, `Closure`, self-binding) and comment mentions do not count |
| Type | L2 (`parseDiBindings` over comment-stripped DI config; binding-position aware) |
| Positive cases | `X::class => Y::class`, `['class' => Y::class]`, `Reference::to(...)->to(...)`, string class targets; 01 additionally requires the target to carry the interface's noun stem (`stemMatch: true`) |
| Negative cases | binding present only as a comment (pinned: `01/near-miss-di-comment`, mutation `di-binding-comment-only`); bound to `\stdClass` (pinned: near-miss + mutation in 01 and 03); bare `X::class` mention without `=>` |
| Evidence | Static: binding pairs parsed from all `config/**/di*` files. Not proven statically: that the container actually resolves the binding |
| L3 boundary | Compile the container from the work dir's config and resolve the interface (`runtime-harness` compiles a real `yiisoft/di` container and resolves services) |
| Criticality | Blocking (required) |
| Skip policy | No skip for release benchmarks |

## `migration-reversible` (+ scenario 27's `up-addcolumn` / `down-drops-column`)

| Field | Content |
|---|---|
| Invariant | `down()` reverts exactly what `up()` changed: every recognized schema operation in `up()` (createTable/addColumn/rename*/index/FK) is paired with its inverse in `down()` carrying the same normalized identifiers |
| Type | L2 (`migrationPairAnalysis`: positional, named, and class-constant arguments resolved; `{{%}}` prefixes normalized; commented calls ignored) |
| Positive cases | literal table/column names; named arguments; `self::TABLE_NAME` constants (pinned: `27/positive-alt-const`, control mutation `control-migration-class-constants` — the exact style the 2026-11-11 campaign falsely penalized) |
| Negative cases | empty `down()`; any `drop*()` for an unrelated table (pinned: `01/near-miss-migration-wrong-drop`, mutation `migration-wrong-table-drop`); wrong column reverted (pinned: `27/near-miss-wrong-column-drop`, mutation `migration-wrong-column-drop`); down() with the call commented out (mutation `migration-down-comment-only`); dynamic (unresolvable) identifiers |
| Evidence | Static: operation pairing. Not proven statically: that the SQL the builder emits actually applies and rolls back on a real schema |
| L3 boundary | up → verify schema (tables/columns/indexes/FKs) → down → verify original state → up again, on a test database. `runtime-harness` runs a real `Migrator` up/down cycle on SQLite |
| Criticality | Blocking (required) |
| Skip policy | No skip for release benchmarks |

## `input-dto-validated` (scenario 13)

| Field | Content |
|---|---|
| Invariant | A typed input DTO exists, carries validator rule attributes **attached to property declarations**, and is **wired** — referenced outside import lines by a changed non-test file |
| Type | L2 (`ruleAttributeAttachment` over comment-stripped source; import-line-excluded wiring scan) |
| Positive cases | `AbstractInput` + `#[FromBody]` + `#[Validate(new ...)]` per property (canonical sample); typed DTO with rule attributes hydrated by an injected hydrator (accepted since the 13 recalibration) |
| Negative cases | rule attributes only in a docblock (pinned: `13/near-miss-dto-docblock-attr`, mutation `dto-attributes-docblock-only`); attribute floating above a class/method instead of a property; DTO declared but unwired (mutation `dto-declared-but-unwired`) |
| Evidence | Static: attribute-to-property attachment + usage scan. Not proven statically: that validation actually rejects invalid values at runtime |
| L3 boundary | Feed the DTO valid/boundary/invalid/missing-field values through the real hydrator-validator pipeline and assert 422 vs 201 (`runtime-harness` exercises `ValidatingHydrator` validation errors) |
| Criticality | Blocking (required) |
| Skip policy | No skip for release benchmarks |

## Sample validation (precision/recall, audit P1)

`selftest.mjs` additionally grades two sample classes declared per scenario:

- `nearMiss: [{ dir, mustFail }]` — a realistic near-correct variant that must be caught
  by **exactly** the listed checks: every `mustFail` id fails (recall) and no other
  required check fails (precision). Current set: 7/7 caught, collateral-free.
- `positiveAlt: [{ dir }]` — a valid implementation style outside the canonical sample
  that must pass all required checks (no false rejections). Current set: layered
  event handling (01) and class-constant migration (27), 2/2 pass.

Reported as the `sample-metrics` line of `selftest.mjs`. Mutation control
(`evals/audit/mutation.mjs`) generates the same defect classes programmatically from the
positive samples: targeted mutants 10/10 caught, controls (behavior-preserving rewrites)
3/3 clean.

## Scenario quality matrix (audit §5.2) — upgraded scenarios

Scale 1–5. Sensitivity = catches the defects its checks claim to catch (now
mutation-pinned); specificity = does not reject valid alternatives (now alt-pinned).

| Criterion | 01-full-add-comment | 03-forgotten-di-binding | 06-convention-conflict | 13-complex-action | 27-migration-add-column |
|---|---|---|---|---|---|
| Realism | 5 | 5 | 4 (conflict framing is constructed) | 5 | 5 |
| Unambiguity | 4 | 4 | 3 (the "correct" resolution is convention-defined) | 4 | 5 |
| Completeness | 4 | 4 | 3 (single conflict axis) | 4 | 4 |
| Sensitivity | 4 (order/pairing mutants caught; stub-body classes remain L3) | 4 | 3 (`conflict-escalated` still transcript-regex) | 4 (docblock/unwired mutants caught) | 5 |
| Specificity | 4 (layered alt pinned) | 4 | 3 (word-match accepts non-resolution mentions) | 4 | 5 (constant style pinned) |
| Runtime depth | 2 (static; L3 via harness) | 2 | 2 | 2 | 3 |
| Reproducibility | 5 | 5 | 4 (transcript judge sensitivity) | 5 | 5 |
| Independence | 4 (overlaps 06 on dispatch order by design) | 5 | 4 | 5 | 5 |

Known residual weaknesses (P2 candidates): `conflict-escalated` (06) and `plan-resolved`
(55) remain transcript-regex checks — semantic escalation/resolution detection needs the
judge layer, not more regex. Their deterministic checks stay as cheap gates; the judge is
the **second channel** for these two scenarios: campaign protocol grades them with
`--input diff --runs 3` (diff-only hides the skill vocabulary; majority-of-3 guards
run-to-run noise) and treats `partial`/`fail` on the report-quality criteria as a
calibration signal, not a gate. Stub-body survivors (method bodies replaced with throws)
are only provable at L3 and are delegated to the runtime harness and hidden acceptance
tests (roadmap).
