import { check, ok, fail, read } from '../../lib/checks.mjs';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

export default [
  check('frankenphp-package-required', 'composer.json requires yiisoft/yii-runner-frankenphp', ({ dir }) => {
    const cPath = join(dir, 'composer.json');
    if (!existsSync(cPath)) return fail('composer.json not found');
    try {
      const c = JSON.parse(read(cPath));
      if (!c.require?.['yiisoft/yii-runner-frankenphp']) {
        return fail('yiisoft/yii-runner-frankenphp is missing from composer.json require');
      }
      return ok();
    } catch (e) {
      return fail('invalid composer.json: ' + e.message);
    }
  }),

  check('worker-script-exists', 'worker.php entry point exists and instantiates FrankenPHPApplicationRunner', ({ dir }) => {
    const wPath = join(dir, 'worker.php');
    if (!existsSync(wPath)) return fail('worker.php not found in project root');
    const content = read(wPath);
    if (!content.includes('FrankenPHPApplicationRunner')) {
      return fail('worker.php does not reference FrankenPHPApplicationRunner');
    }
    if (!content.includes('->run()')) {
      return fail('worker.php does not execute ->run()');
    }
    return ok();
  }),

  check('caddyfile-exists', 'Caddyfile exists and configures frankenphp worker', ({ dir }) => {
    const cPath = join(dir, 'Caddyfile');
    if (!existsSync(cPath)) return fail('Caddyfile not found');
    const content = read(cPath);
    if (!content.includes('frankenphp')) {
      return fail('Caddyfile does not configure frankenphp directive');
    }
    return ok();
  }),

  check('user-abort-protection', 'worker.php guarantees ignore_user_abort protection', ({ dir }) => {
    const wPath = join(dir, 'worker.php');
    if (!existsSync(wPath)) return fail('worker.php not found');
    const content = read(wPath);
    // Either calls ignore_user_abort directly or imports FrankenPHPApplicationRunner (which calls it at include time)
    if (!content.includes('ignore_user_abort') && !content.includes('FrankenPHPApplicationRunner')) {
      return fail('worker.php lacks ignore_user_abort container protection');
    }
    return ok();
  })
];
