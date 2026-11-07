import { check, ok, fail, read, walk, rel } from '../../lib/checks.mjs';
import { join } from 'node:path';

export default [
  check('no-yii3-code', 'No Yii3 constructs (Yiisoft\\ imports, Yii3 config layout) in changed files', ({ changed }) => {
    const hits = changed.filter((c) =>
      (/\.php$/.test(c.path) && /Yiisoft\\/i.test(read(c.abs))) ||
      /^config\/(common|di|console)\//.test(c.path) ||
      c.path === 'config/web/routes.php'
    );
    return hits.length ? fail(hits.map((h) => h.path).join(', ')) : ok();
  }),

  check('no-yii3-workflow-output', 'No Yii3 workflow output (Stage 0, Mission Workflow, Chain Integrity) without an inapplicability report', ({ transcript }) =>
    /Stage 0|Mission Workflow|Chain Integrity|Architecture:\s|Production Readiness/i.test(transcript) && !/not applicable|inapplicab|no yiisoft|yii\s*2/i.test(transcript)
      ? fail('Yii3 workflow found in transcript')
      : ok()),

  check('yii2-idioms-kept', 'Existing Yii2 code (Yii::$app usages) is not rewritten to purge Yii2 idioms', ({ dir, base }) => {
    const kept = walk(base)
      .filter((p) => p.endsWith('.php') && read(p).includes('Yii::$app'))
      .map((p) => rel(base, p));
    const lost = kept.filter((r) => {
      try {
        return !read(join(dir, r)).includes('Yii::$app');
      } catch {
        return true;
      }
    });
    return lost.length ? fail(`Yii::$app removed from: ${lost.join(', ')}`) : ok(kept.join(', '));
  }),

  check('yii2-solution', 'The /health endpoint is added idiomatically for Yii2 (controller action with FORMAT_JSON or a urlManager rule)', ({ changed }) => {
    const hit = changed.find((c) => /\.php$/.test(c.path) && /actionHealth|Response::FORMAT_JSON|'\/health'|"\/health"/.test(read(c.abs)));
    return hit ? ok(hit.path) : fail('no Yii2-idiomatic /health endpoint found in changed files');
  }, { required: false }),
];
