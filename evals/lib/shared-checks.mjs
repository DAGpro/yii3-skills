// Canonical shared hygiene checks used by all scenarios. One implementation instead of
// per-scenario regex copies (audit fix 2026-11-12):
//   - comments, string literals and heredocs are blanked before pattern matching, so
//     docblock mentions and string contents no longer produce false positives;
//   - the Yii2 ban is the union of all former per-scenario variants, minus `#[Override]`
//     (a code-style convention per core-version-notes.md R10, reported as a separate
//     non-blocking advisory, not a Yii2 construct);
//   - `strict_types` accepts whitespace variants (`declare( strict_types = 1 );`).
// Scenario checks import these factories instead of re-implementing the regexes.
import { check, ok, fail, read, stripPhpNoise, methodBody, filesMatching } from './checks.mjs';
import { migrationPairAnalysis, parseDiBindings, dispatchOrderViolations, stripPhpComments } from './semantic.mjs';

const NO_YII2_RE = /\bYii::|use\s+yii\\|\byii\\|ActiveForm::|->setFlash\s*\(|->getFlash\s*\(/;
const STRICT_TYPES_RE = /declare\s*\(\s*strict_types\s*=\s*1\s*\)\s*;/;
const TWIG_COMMENT_RE = /\{#[\s\S]*?#\}/g;

export const phpFiles = (changed) => changed.filter((c) => c.path.endsWith('.php'));

const stripForFile = (path, text) =>
  path.endsWith('.twig')
    ? stripPhpNoise(text.replace(TWIG_COMMENT_RE, (m) => ' '.repeat(m.length)))
    : stripPhpNoise(text);

/**
 * Canonical `no-yii2` hygiene check (category: hygiene).
 * options.files overrides the scanned file list - default is the changed PHP files,
 * e.g. `(changed) => phpFiles(changed).concat(twigFiles(changed))` for template work.
 */
export const noYii2Check = ({ files } = {}) =>
  check(
    'no-yii2',
    'No Yii2 constructs in changed PHP files (Yii:: facade, yii\\ namespaces, ActiveForm, session flash methods)',
    ({ changed }) => {
      const bad = (files ?? phpFiles)(changed).filter((c) => NO_YII2_RE.test(stripForFile(c.path, read(c.abs))));
      return bad.length ? fail(bad.map((b) => b.path).join(', ')) : ok();
    },
    { required: true, category: 'hygiene' },
  );

/** Canonical `strict-types` hygiene check: declare(strict_types=1) in every ADDED PHP file. */
export const strictTypesCheck = () =>
  check(
    'strict-types',
    'declare(strict_types=1) in every added PHP file',
    ({ changed }) => {
      const bad = phpFiles(changed)
        .filter((c) => c.added)
        .filter((c) => !STRICT_TYPES_RE.test(stripPhpNoise(read(c.abs))));
      return bad.length ? fail(bad.map((b) => b.path).join(', ')) : ok();
    },
    { required: true, category: 'hygiene' },
  );

/** `strict-types` variant for template/asset-work scenarios: every CHANGED PHP file must carry the declare. */
export const strictTypesAllChangedCheck = () =>
  check(
    'strict-types',
    'declare(strict_types=1) present in every changed PHP file',
    ({ changed }) => {
      const bad = phpFiles(changed).filter((c) => !STRICT_TYPES_RE.test(stripPhpNoise(read(c.abs))));
      return bad.length ? fail(bad.map((b) => b.path).join(', ')) : ok();
    },
    { required: true, category: 'hygiene' },
  );

/**
 * Convention advisory (core-version-notes.md R10): the `#[Override]` attribute is stripped
 * by the Yii CORE rector preset, but without the preset in the target project it is a
 * style suggestion only - never a blocking error.
 */
export const overrideAdvisoryCheck = () =>
  check(
    'override-attribute',
    'Convention advisory (R10): #[Override] is removed by the Yii CORE rector preset (suggestion only, not an error)',
    ({ changed }) => {
      const bad = phpFiles(changed).filter((c) => /#\[Override\]/.test(stripPhpNoise(read(c.abs))));
      return bad.length
        ? fail(`convention suggestion (non-blocking): ${bad.map((b) => b.path).join(', ')}`)
        : ok();
    },
    { required: false, category: 'convention' },
  );

// --- semantic invariant factories (audit P1) ------------------------------------

const addedInterfaces = (changed) =>
  changed.filter((c) => c.added && /^src\/.*Interface\.php$/.test(c.path))
    .map((c) => c.path.split('/').pop().replace(/\.php$/, ''));

const diConfigText = (dir) =>
  filesMatching(dir, /^config\/.*\/di\/.*\.php$|^config\/.*\/di\.php$/).map(read).join('\n');

const isDummyTarget = (target) => {
  const short = target.replace(/^\\/, '').split('\\').pop();
  return short === 'stdClass' || short === 'Closure';
};

/**
 * Semantic `interface-bound` (audit P1): every added interface must be bound in a DI
 * binding POSITION (array key / Reference chain) to a concrete class target - a comment
 * mention or a bare `X::class` reference does not count, and dummy targets (\stdClass,
 * self-binding) fail. options.stemMatch additionally requires the target short name to
 * carry the interface's noun stem (CommentRepositoryInterface -> *CommentRepository);
 * use it only where the scenario's prompt prescribes the naming convention.
 * Full container resolvability is L3 (contract: evals/CHECK-CONTRACTS.md).
 */
export const interfaceBoundCheck = ({ stemMatch = false, noInterfacesMessage = 'no interface added under src/' } = {}) =>
  check(
    'interface-bound',
    stemMatch
      ? 'Every added interface is bound in config/**/di/*.php to an implementation of its noun stem (binding position, not a mention)'
      : 'Every added interface is bound in config/**/di/*.php to a concrete class (binding position, not a mention)',
    ({ changed, dir }) => {
      const ifaces = addedInterfaces(changed);
      if (!ifaces.length) return fail(noInterfacesMessage);
      const bindings = parseDiBindings(diConfigText(dir));
      const problems = [];
      for (const i of ifaces) {
        const b = bindings.find((x) => x.id === i || x.id.endsWith('\\' + i));
        if (!b) {
          problems.push(`${i}: not bound (a mention in a comment or a bare reference does not count)`);
          continue;
        }
        const short = b.target.split('\\').pop();
        if (isDummyTarget(b.target)) {
          problems.push(`${i}: bound to ${short} (not a real implementation)`);
          continue;
        }
        if (short === i) {
          problems.push(`${i}: bound to itself`);
          continue;
        }
        const stem = i.replace(/Interface$/, '');
        if (stemMatch && !short.includes(stem)) {
          problems.push(`${i}: bound to ${short} (expected an implementation of ${stem})`);
        }
      }
      return problems.length ? fail(problems.join('; ')) : ok(ifaces.join(', '));
    },
    { required: true, category: 'invariant' },
  );

/**
 * Semantic `migration-reversible` (audit P1): down() must revert exactly what up()
 * changed - every recognized schema operation in up() (createTable/addColumn/...) is
 * paired with its inverse in down() carrying the same normalized identifiers ({{%}}
 * prefix stripped; positional or named arguments; class constants resolved).
 * A bare `drop*()` for an unrelated table no longer counts as reversible.
 * The physical up->down->up round-trip on a database is L3 (runtime-harness).
 */
export const migrationReversibleCheck = () =>
  check(
    'migration-reversible',
    'New migration in migrations/ whose down() reverts exactly what up() changed (paired schema operations, same identifiers)',
    ({ changed }) => {
      const m = changed.filter((c) => c.added && /^migrations\/.*\.php$/.test(c.path));
      if (!m.length) return fail('no new migration');
      const problems = [];
      for (const f of m) {
        const t = read(f.abs);
        const up = methodBody(t, 'up');
        const down = methodBody(t, 'down');
        if (!down) {
          problems.push(`${f.path}: down() missing or empty`);
          continue;
        }
        const a = migrationPairAnalysis(up, down, t);
        if (!a.recognized) {
          problems.push(`${f.path}: no recognizable schema operation in up()`);
          continue;
        }
        if (a.missing.length) problems.push(`${f.path}: down() does not revert: ${a.missing.join('; ')}`);
      }
      return problems.length ? fail(problems.join('; ')) : ok(m.map((x) => x.path).join(', '));
    },
    { required: true, category: 'invariant' },
  );

/**
 * Semantic post-commit dispatch gate (audit P1): in any file where dispatch() and
 * transaction() are co-located in one method, dispatch() must come after the
 * transaction() call completes - not inside its closure and not before it begins.
 * Layered solutions (transaction in the repository, dispatch in the use case) have no
 * co-located scope and pass here; that cross-file boundary is proven at L3.
 */
export const dispatchAfterCommitCheck = ({ id = 'event-after-commit' } = {}) =>
  check(
    id,
    'dispatch() fires only after transaction() completes: not inside its closure and not before it begins (same-method co-location)',
    ({ changed }) => {
      const violations = [];
      for (const c of phpFiles(changed)) {
        for (const v of dispatchOrderViolations(read(c.abs))) {
          violations.push(`${c.path}: ${v}`);
        }
      }
      return violations.length ? fail(violations.join('; ')) : ok();
    },
    { required: true, category: 'invariant' },
  );
