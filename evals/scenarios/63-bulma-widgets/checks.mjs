import { check, ok, fail, read, filesMatching } from '../../lib/checks.mjs';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

export default [
  check('bulma-package-required', 'composer.json requires yiisoft/yii-bulma', ({ dir }) => {
    const cPath = join(dir, 'composer.json');
    if (!existsSync(cPath)) return fail('composer.json not found');
    try {
      const c = JSON.parse(read(cPath));
      if (!c.require?.['yiisoft/yii-bulma']) {
        return fail('yiisoft/yii-bulma is missing from composer.json require');
      }
      return ok();
    } catch (e) {
      return fail('invalid composer.json: ' + e.message);
    }
  }),

  check('progressbar-constant-styling', 'View uses ProgressBar with class constants', ({ dir }) => {
    const viewFiles = filesMatching(dir, /(^|\/)views\/.*\.php$/);
    if (viewFiles.length === 0) return fail('no view files found in views/');
    let hasProgressBarConstant = false;
    for (const f of viewFiles) {
      const content = read(f);
      if (content.includes('ProgressBar::COLOR_')) {
        hasProgressBarConstant = true;
        break;
      }
    }
    return hasProgressBarConstant ? ok() : fail('views do not use ProgressBar::COLOR_* class constants');
  }),

  check('tabs-associative-items', 'View uses Tabs::widget with Tabs::STYLE_* and associative array items', ({ dir }) => {
    const viewFiles = filesMatching(dir, /(^|\/)views\/.*\.php$/);
    let hasTabs = false;
    for (const f of viewFiles) {
      const content = read(f);
      if (content.includes('Tabs::widget') && content.includes('Tabs::STYLE_') && content.includes("'label' =>")) {
        hasTabs = true;
        break;
      }
    }
    return hasTabs ? ok() : fail('views do not use Tabs::widget with Tabs::STYLE_* and associative array items');
  }),

  check('no-bootstrap-mix', 'composer.json does not install yiisoft/bootstrap5 (mutually exclusive CSS driver)', ({ dir }) => {
    const cPath = join(dir, 'composer.json');
    if (existsSync(cPath)) {
      try {
        const c = JSON.parse(read(cPath));
        if (c.require?.['yiisoft/bootstrap5'] || c['require-dev']?.['yiisoft/bootstrap5']) {
          return fail('yiisoft/bootstrap5 co-installed with Bulma (violates exclusive CSS driver rule)');
        }
      } catch {}
    }
    return ok();
  })
];
