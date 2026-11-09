import { check, ok, fail, read, filesMatching } from '../../lib/checks.mjs';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

export default [
  check('bootstrap5-package-required', 'composer.json requires yiisoft/bootstrap5', ({ dir }) => {
    const cPath = join(dir, 'composer.json');
    if (!existsSync(cPath)) return fail('composer.json not found');
    try {
      const c = JSON.parse(read(cPath));
      if (!c.require?.['yiisoft/bootstrap5']) {
        return fail('yiisoft/bootstrap5 is missing from composer.json require');
      }
      return ok();
    } catch (e) {
      return fail('invalid composer.json: ' + e.message);
    }
  }),

  check('alert-variant-enum-used', 'View uses AlertVariant enum rather than untyped strings', ({ dir }) => {
    const viewFiles = filesMatching(dir, /(^|\/)views\/.*\.php$/);
    if (viewFiles.length === 0) return fail('no view files found in views/');
    let hasVariantEnum = false;
    for (const f of viewFiles) {
      const content = read(f);
      if (content.includes('AlertVariant::')) {
        hasVariantEnum = true;
        break;
      }
    }
    return hasVariantEnum ? ok() : fail('views do not use AlertVariant enum constants');
  }),

  check('nav-widget-tab-factory', 'View uses NavLink::tab with NavStyle::TABS', ({ dir }) => {
    const viewFiles = filesMatching(dir, /(^|\/)views\/.*\.php$/);
    let hasTabs = false;
    for (const f of viewFiles) {
      const content = read(f);
      if (content.includes('NavLink::tab') && content.includes('NavStyle::TABS')) {
        hasTabs = true;
        break;
      }
    }
    return hasTabs ? ok() : fail('views do not use NavLink::tab with NavStyle::TABS');
  }),

  check('no-bulma-mix', 'composer.json does not install yiisoft/yii-bulma (mutually exclusive CSS driver)', ({ dir }) => {
    const cPath = join(dir, 'composer.json');
    if (existsSync(cPath)) {
      try {
        const c = JSON.parse(read(cPath));
        if (c.require?.['yiisoft/yii-bulma'] || c['require-dev']?.['yiisoft/yii-bulma']) {
          return fail('yiisoft/yii-bulma co-installed with Bootstrap 5 (violates exclusive CSS driver rule)');
        }
      } catch {}
    }
    return ok();
  })
];
