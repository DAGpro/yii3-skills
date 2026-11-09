import { check, ok, fail, read } from '../../lib/checks.mjs';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

export default [
  check('roadrunner-package-required', 'composer.json requires yiisoft/yii-runner-roadrunner', ({ dir }) => {
    const cPath = join(dir, 'composer.json');
    if (!existsSync(cPath)) return fail('composer.json not found');
    try {
      const c = JSON.parse(read(cPath));
      if (!c.require?.['yiisoft/yii-runner-roadrunner']) {
        return fail('yiisoft/yii-runner-roadrunner is missing from composer.json require');
      }
      return ok();
    } catch (e) {
      return fail('invalid composer.json: ' + e.message);
    }
  }),

  check('worker-script-exists', 'worker.php entry point exists and instantiates RoadRunnerApplicationRunner', ({ dir }) => {
    const wPath = join(dir, 'worker.php');
    if (!existsSync(wPath)) return fail('worker.php not found in project root');
    const content = read(wPath);
    if (!content.includes('RoadRunnerApplicationRunner')) {
      return fail('worker.php does not reference RoadRunnerApplicationRunner');
    }
    if (!content.includes('->run()')) {
      return fail('worker.php does not execute ->run()');
    }
    return ok();
  }),

  check('rr-config-exists', '.rr.yaml server config exists and specifies worker command', ({ dir }) => {
    const rrPath = join(dir, '.rr.yaml');
    if (!existsSync(rrPath)) return fail('.rr.yaml not found');
    const content = read(rrPath);
    if (!content.includes('worker.php')) {
      return fail('.rr.yaml does not specify worker.php command');
    }
    return ok();
  }),

  check('no-standard-sapi-emitter', 'worker.php does not use SapiEmitter', ({ dir }) => {
    const wPath = join(dir, 'worker.php');
    if (existsSync(wPath)) {
      const content = read(wPath);
      if (/SapiEmitter/i.test(content)) {
        return fail('worker.php uses standard SapiEmitter instead of RoadRunner worker protocol');
      }
    }
    return ok();
  })
];
