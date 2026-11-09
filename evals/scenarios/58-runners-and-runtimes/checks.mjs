import { check, ok, fail, read, filesMatching } from '../../lib/checks.mjs';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

export default [
  check('http-runner-entry-point', 'public/index.php instantiates and runs HttpApplicationRunner', ({ dir }) => {
    const indexPath = join(dir, 'public', 'index.php');
    if (!existsSync(indexPath)) return fail('public/index.php not found');
    const content = read(indexPath);
    if (!content.includes('HttpApplicationRunner')) {
      return fail('public/index.php does not reference HttpApplicationRunner');
    }
    if (!content.includes('->run()')) {
      return fail('public/index.php does not execute ->run()');
    }
    return ok();
  }),

  check('console-runner-entry-point', './yii console binary instantiates and runs ConsoleApplicationRunner', ({ dir }) => {
    const yiiPath = join(dir, 'yii');
    if (!existsSync(yiiPath)) return fail('./yii not found');
    const content = read(yiiPath);
    if (!content.includes('ConsoleApplicationRunner')) {
      return fail('./yii does not reference ConsoleApplicationRunner');
    }
    if (!content.includes('->run()')) {
      return fail('./yii does not execute ->run()');
    }
    return ok();
  }),

  check('no-legacy-yii-facade', 'No legacy Yii::$app static facades used in entry points', ({ dir }) => {
    for (const rel of ['public/index.php', 'yii']) {
      const p = join(dir, rel);
      if (existsSync(p)) {
        const content = read(p);
        if (/Yii::\$app/i.test(content)) {
          return fail(`${rel} contains legacy Yii::$app call`);
        }
      }
    }
    return ok();
  }),

  check('composer-runners-declared', 'composer.json declares yiisoft/yii-runner-http and yiisoft/yii-runner-console', ({ dir }) => {
    const cPath = join(dir, 'composer.json');
    if (!existsSync(cPath)) return fail('composer.json not found');
    try {
      const c = JSON.parse(read(cPath));
      const req = c.require || {};
      if (!req['yiisoft/yii-runner-http'] || !req['yiisoft/yii-runner-console']) {
        return fail('missing runner packages in composer.json require');
      }
      return ok();
    } catch (e) {
      return fail('invalid composer.json: ' + e.message);
    }
  })
];
