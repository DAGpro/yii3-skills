import { check, ok, fail, read } from '../../lib/checks.mjs';

export default [
  check('mode-light', 'The task is classified Patch or Light (docs-only, no feature stages)', ({ transcript }) =>
    /Mode:\s*(Patch|Light)/i.test(transcript) ? ok() : fail('no "Mode: Patch" (or Light) in the transcript')),

  check('docs-only-changes', 'Only documentation files changed (no PHP, config, or migration machinery for a docs task)', ({ changed }) => {
    const bad = changed.filter((c) => !/\.(md|txt)$/.test(c.path));
    return bad.length ? fail(bad.map((b) => b.path).join(', ')) : ok(changed.map((c) => c.path).join(', '));
  }),

  check('readme-documents', "The README documents the '/health' endpoint and a run command (./yii serve)", ({ dir }) => {
    let readme = '';
    try {
      readme = read(`${dir}/README.md`);
    } catch {
      return fail('no README.md in the work dir');
    }
    const missing = [];
    if (!/\/health/.test(readme)) missing.push("no '/health' documentation");
    if (!/\.\/yii serve|yii serve|php yii serve/i.test(readme)) missing.push('no run command (./yii serve)');
    return missing.length ? fail(missing.join('; ')) : ok();
  }),

  check('report-block', 'The report block is present with an Architecture line', ({ transcript }) =>
    /Architecture:\s*\S/i.test(transcript) ? ok() : fail('no Architecture line in the report block')),
];
