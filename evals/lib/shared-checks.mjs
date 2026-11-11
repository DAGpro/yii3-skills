// Canonical shared hygiene checks used by all scenarios. One implementation instead of
// per-scenario regex copies (audit fix 2026-11-12):
//   - comments, string literals and heredocs are blanked before pattern matching, so
//     docblock mentions and string contents no longer produce false positives;
//   - the Yii2 ban is the union of all former per-scenario variants, minus `#[Override]`
//     (a code-style convention per core-version-notes.md R10, reported as a separate
//     non-blocking advisory, not a Yii2 construct);
//   - `strict_types` accepts whitespace variants (`declare( strict_types = 1 );`).
// Scenario checks import these factories instead of re-implementing the regexes.
import { check, ok, fail, read, stripPhpNoise } from './checks.mjs';

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
