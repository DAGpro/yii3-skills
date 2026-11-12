import { check, ok, fail, read } from '../../lib/checks.mjs';
import { noYii2Check, strictTypesCheck, dispatchAfterCommitCheck } from '../../lib/shared-checks.mjs';

const php = (changed) => changed.filter((c) => c.path.endsWith('.php'));

export default [
  check('event-dispatch-present', 'A domain event dispatch (->dispatch(...) with a UserRegistered event) is present in changed files', ({ changed }) => {
    const hit = php(changed).filter((c) => /->dispatch\s*\(/.test(read(c.abs)));
    return hit.length ? ok(hit.map((h) => h.path).join(', ')) : fail('no ->dispatch( call in changed files');
  }),

  dispatchAfterCommitCheck({ id: 'dispatch-after-commit' }),

  check('conflict-escalated', 'The conflict between the project standard and the post-commit rule is surfaced (guide wins, decision recorded or user asked)', ({ transcript }) =>
    /(post-commit|after the transaction|conflict|divergen|ask(ing)? the user|record(ed)? the (decision|divergence))/i.test(transcript)
      ? ok()
      : fail('no mention of the post-commit rule / conflict / recorded decision in the transcript')),

  noYii2Check(),

  strictTypesCheck(),
];
