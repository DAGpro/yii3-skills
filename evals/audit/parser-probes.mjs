// Regression probes for the PHP parsing helpers and the canonical hygiene checks.
// These are meta-tests: they grade the graders (external-audit follow-up, 2026-11-12).
// Invoked as a phase of runner/selftest.mjs; also standalone:
//   node evals/audit/parser-probes.mjs   (exit 0 = all probes pass)
import { matchParen, methodBody, stripPhpNoise } from '../lib/checks.mjs';
import { noYii2Check, strictTypesCheck, overrideAdvisoryCheck } from '../lib/shared-checks.mjs';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Runs all parser/canonical-check probes; returns the list of failed probe names
 * (empty = all green). `log` defaults to console.log; selftest passes its own sink.
 */
export async function runParserProbes(log = (line) => console.log(line)) {
  const failures = [];
  const t = (name, cond) => { log(`${cond ? 'PASS' : 'FAIL'} ${name}`); if (!cond) failures.push(name); };

  const dir = mkdtempSync(join(tmpdir(), 'eval-probes-'));
  try {
    mkdirSync(join(dir, 'src'), { recursive: true });
    const file = (name, content) => { const p = join(dir, name); writeFileSync(p, content); return p; };
    const run = (checker, files) => {
      const changed = files.map(([name, content, added]) => ({ path: name, abs: file(name, content), added: added !== false }));
      return checker().run({ changed, dir, transcript: '', mode: 'probe' });
    };

    // matchParen must survive a string ending with an escaped backslash ('\\' = one backslash)
    const code1 = "$db->transaction(function ($db) { $q = $db->quote('a\\\\'); })";
    t('matchParen survives backslash-string', matchParen(code1, code1.indexOf('(')) === code1.lastIndexOf(')'));

    // matchParen must survive a heredoc containing an apostrophe
    const code2 = "$db->transaction(function ($db) { $s = <<<EOT\nit's fine\nEOT;\n$db->insert('t'); })";
    t('matchParen survives heredoc with apostrophe', matchParen(code2, code2.indexOf('(')) === code2.lastIndexOf(')'));

    // '#' must not swallow PHP 8 attribute parens as a comment
    const code3 = "$db->transaction(function () {\n    #[Validate(new Length(5))]\n    public $x;\n})";
    t('attribute parens not treated as comment', matchParen(code3, code3.indexOf('(')) === code3.lastIndexOf(')'));

    // methodBody works on a method containing a backslash string
    const code4 = "<?php class A { public function down(): void { $q = 'a\\\\'; $this->dropTable('{{%x}}'); } }";
    const body4 = methodBody(code4, 'down');
    t('methodBody finds down() with backslash string', body4 !== null && body4.includes('dropTable'));

    // strict_types accepts whitespace variants, still rejects a missing declare
    t('strict-types accepts `declare( strict_types = 1 );`', (await run(strictTypesCheck, [['src/A.php', '<?php declare( strict_types = 1 );']])).pass === true);
    t('strict-types rejects missing declare', (await run(strictTypesCheck, [['src/A.php', '<?php namespace App;']])).pass === false);

    // comments and string contents no longer trigger no-yii2
    t('no-yii2 ignores docblock mention of Yii::$app', (await run(noYii2Check, [['src/A.php', '<?php declare(strict_types=1);\n// never use Yii::$app here\n/** @see Yii::t */']])).pass === true);
    t('no-yii2 ignores string content mentioning Yii::$app', (await run(noYii2Check, [["src/A.php", "<?php declare(strict_types=1);\n$s = 'migrate away from Yii::$app';"]])).pass === true);

    // no-yii2 catches real Yii2 constructs, incl. FQ \yii\ helper use and Yii::createObject
    t('no-yii2 catches Yii::$app', (await run(noYii2Check, [['src/A.php', '<?php declare(strict_types=1); echo Yii::$app->id;']])).pass === false);
    t('no-yii2 catches \\yii\\helpers FQ call', (await run(noYii2Check, [['src/A.php', '<?php declare(strict_types=1); echo \\yii\\helpers\\Html::encode($x);']])).pass === false);
    t('no-yii2 catches Yii::createObject', (await run(noYii2Check, [['src/A.php', '<?php declare(strict_types=1); Yii::createObject(X::class);']])).pass === false);
    t('no-yii2 catches session ->getFlash(', (await run(noYii2Check, [['src/A.php', '<?php declare(strict_types=1); $v = $session->getFlash("k");']])).pass === false);

    // valid PHP 8.2 code is not falsely banned: #[Override] left no-yii2 (R10), advisory-only elsewhere
    t('no-yii2 passes valid #[Override] (R10)', (await run(noYii2Check, [['src/A.php', '<?php declare(strict_types=1);\nclass A extends B { #[Override]\n public function x(): void {} }']])).pass === true);
    const adv = await run(overrideAdvisoryCheck, [['src/A.php', '<?php declare(strict_types=1);\nclass A extends B { #[Override]\n public function x(): void {} }']]);
    t('override-attribute advisory fires as a failed non-required check', adv.pass === false && overrideAdvisoryCheck().required === false);

    // stripPhpNoise preserves offsets and newlines
    const src = "<?php\ndeclare(strict_types=1); // c\n$x = 'str';\n";
    const stripped = stripPhpNoise(src);
    t('stripPhpNoise preserves offsets and newlines', stripped.length === src.length
      && stripped.split('\n').length === src.split('\n').length
      && stripped.includes('declare(strict_types=1);')
      && !stripped.includes("'str'"));

    return failures;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const failures = await runParserProbes();
  console.log(failures.length ? `\n${failures.length} probe(s) failed` : '\nall parser probes passed');
  process.exit(failures.length ? 1 : 0);
}
