import { check, ok, fail, read } from '../../lib/checks.mjs';

export default [
  check('no-yii3-code', 'No Yii3 constructs (Yiisoft\, config/*) in changed files', ({ changed }) => {
    const hits = changed.filter((c) => /^config\//.test(c.path) || (/\.php$/.test(c.path) && /Yiisoft\\|yiisoft\//.test(read(c.abs))));
    return hits.length ? fail(hits.map((h) => h.path).join(', ')) : ok();
  }),

  check('no-yii3-workflow-output', 'No Yii3 workflow output (Architecture:, Stage 0, Chain Integrity)', ({ transcript }) =>
    /Architecture:\s|Stage 0|Chain Integrity|Production Readiness/i.test(transcript) && !/not applicable|inapplicab|no yiisoft/i.test(transcript)
      ? fail('Yii3 workflow found in transcript')
      : ok()),

  check('endpoint-added', 'The /health endpoint is added idiomatically for Laravel (routes/*.php)', ({ changed }) => {
    const hit = changed.find((c) => /^routes\/.*\.php$/.test(c.path) && /\/health/.test(read(c.abs)));
    return hit ? ok(hit.path) : fail('no /health in routes/');
  }, { required: false }),
];
