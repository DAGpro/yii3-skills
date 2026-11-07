import { check, ok, fail, read } from '../../lib/checks.mjs';

export default [
  check('no-yii3-code', 'No Yii3 constructs (Yiisoft\\ imports, Yii3 config layout) in changed files', ({ changed }) => {
    const hits = changed.filter((c) =>
      (/\.php$/.test(c.path) && /Yiisoft\\/i.test(read(c.abs))) ||
      /^config\/(common|di|console|web)\//.test(c.path)
    );
    return hits.length ? fail(hits.map((h) => h.path).join(', ')) : ok();
  }),

  check('no-yii3-workflow-output', 'No Yii3 workflow output (Stage 0, Mission Workflow, Chain Integrity) without an inapplicability report', ({ transcript }) =>
    /Stage 0|Mission Workflow|Chain Integrity|Architecture:\s|Production Readiness/i.test(transcript) && !/not applicable|inapplicab|no yiisoft|not a Yii 3 application|ecosystem library/i.test(transcript)
      ? fail('Yii3 workflow found in transcript')
      : ok()),

  check('solution-added', 'The slugify() method is added to StringService idiomatically (plain PHP, no framework constructs)', ({ changed }) => {
    const hit = changed.find((c) => c.path.endsWith('StringService.php') && /function\s+slugify/.test(read(c.abs)));
    return hit ? ok(hit.path) : fail('no slugify() method found in StringService.php');
  }, { required: false }),
];
