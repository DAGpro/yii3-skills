import { check, ok, fail, read, matchParen } from '../../lib/checks.mjs';

const php = (changed) => changed.filter((c) => c.path.endsWith('.php'));

export default [
  check('event-dispatch-present', 'A domain event dispatch (->dispatch(...) with a UserRegistered event) is present in changed files', ({ changed }) => {
    const hit = php(changed).filter((c) => /->dispatch\s*\(/.test(read(c.abs)));
    return hit.length ? ok(hit.map((h) => h.path).join(', ')) : fail('no ->dispatch( call in changed files');
  }),

  check('dispatch-after-commit', 'The dispatch is not inside a transaction() call (post-commit dispatch rule — correctness, guide wins over the project convention)', ({ changed }) => {
    const offenders = [];
    for (const c of php(changed)) {
      const t = read(c.abs);
      if (!/->dispatch\s*\(/.test(t)) continue;
      const txRe = /->transaction\s*\(/g;
      let m;
      while ((m = txRe.exec(t)) !== null) {
        const open = t.indexOf('(', m.index);
        const close = matchParen(t, open);
        if (close === -1) continue;
        if (/->dispatch\s*\(/.test(t.slice(open, close))) offenders.push(`${c.path}: dispatch inside the transaction() closure`);
      }
    }
    return offenders.length ? fail(offenders.join('; ')) : ok('no dispatch inside a transaction() call');
  }),

  check('conflict-escalated', 'The conflict between the project standard and the post-commit rule is surfaced (guide wins, decision recorded or user asked)', ({ transcript }) =>
    /(post-commit|after the transaction|conflict|divergen|ask(ing)? the user|record(ed)? the (decision|divergence))/i.test(transcript)
      ? ok()
      : fail('no mention of the post-commit rule / conflict / recorded decision in the transcript')),

  check('no-yii2', 'No Yii2 constructs in changed PHP files', ({ changed }) => {
    const re = /Yii::\$app|\buse\s+yii\\|ActiveForm::begin|->getFlash\(|\$this->render\(/;
    const bad = php(changed).filter((c) => re.test(read(c.abs)));
    return bad.length ? fail(bad.map((b) => b.path).join(', ')) : ok();
  }),

  check('strict-types', 'declare(strict_types=1) in every added PHP file', ({ changed }) => {
    const bad = php(changed).filter((c) => c.added && !/declare\(strict_types=1\);/.test(read(c.abs)));
    return bad.length ? fail(bad.map((b) => b.path).join(', ')) : ok();
  }),
];
