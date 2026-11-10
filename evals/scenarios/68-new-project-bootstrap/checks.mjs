import { check, ok, fail, read, filesMatching } from '../../lib/checks.mjs';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const php = (changed) => changed.filter((c) => c.path.endsWith('.php'));

export default [
  check('composer-json-bootstrapped', 'composer.json created with Yii3 runtime stack, yiisoft/config plugin trust, and extra.config-plugin-file', ({ dir }) => {
    const p = join(dir, 'composer.json');
    if (!existsSync(p)) return fail('composer.json was not created');
    let json;
    try {
      json = JSON.parse(read(p));
    } catch (e) {
      return fail(`invalid composer.json: ${e.message}`);
    }
    const req = json.require ?? {};
    if (!req['yiisoft/yii-runner-http'] || !req['yiisoft/yii-console']) {
      return fail('composer.json missing yiisoft/yii-* application runtime packages (yiisoft/yii-runner-http, yiisoft/yii-console)');
    }
    if (json?.config?.['allow-plugins']?.['yiisoft/config'] !== true) {
      return fail('composer.json does not allow yiisoft/config plugin in config.allow-plugins');
    }
    if (json?.extra?.['config-plugin-file'] !== 'config/configuration.php') {
      return fail(`extra.config-plugin-file must be "config/configuration.php", got ${JSON.stringify(json?.extra?.['config-plugin-file'])}`);
    }
    return ok();
  }),

  check('single-db-driver-pgsql', 'Exactly one database driver (yiisoft/db + yiisoft/db-pgsql) is configured without conflicting DB drivers', ({ dir }) => {
    const p = join(dir, 'composer.json');
    if (!existsSync(p)) return fail('composer.json missing');
    let json;
    try {
      json = JSON.parse(read(p));
    } catch {
      return fail('invalid composer.json');
    }
    const req = { ...(json.require ?? {}), ...(json['require-dev'] ?? {}) };
    if (!req['yiisoft/db'] || !req['yiisoft/db-pgsql']) {
      return fail('composer.json missing yiisoft/db or yiisoft/db-pgsql');
    }
    const otherDrivers = ['yiisoft/db-mysql', 'yiisoft/db-sqlite', 'yiisoft/db-mssql', 'yiisoft/db-oracle'].filter((d) => d in req);
    if (otherDrivers.length > 0) {
      return fail(`multiple DB drivers declared: ${otherDrivers.join(', ')}`);
    }
    return ok();
  }),

  check('config-entrypoint-present', 'config/configuration.php entrypoint defines config-plugin groups', ({ dir }) => {
    const p = join(dir, 'config', 'configuration.php');
    if (!existsSync(p)) return fail('config/configuration.php missing');
    const s = read(p);
    return /config-plugin/.test(s) && /'routes'/.test(s) && /'di'/.test(s)
      ? ok()
      : fail('config/configuration.php missing config-plugin groups (routes/di)');
  }),

  check('health-endpoint-thin-action', 'Thin HealthAction returning ResponseInterface is mounted on GET /health', ({ dir }) => {
    const routeFiles = filesMatching(dir, /^config\/.*routes.*\.php$/);
    const routeText = routeFiles.map(read).join('\n');
    if (!/\/health/.test(routeText) || !/HealthAction::class/.test(routeText)) {
      return fail('GET /health -> HealthAction::class route missing under config/');
    }
    const actions = filesMatching(dir, /HealthAction\.php$/);
    if (!actions.length) return fail('HealthAction.php missing');
    const src = read(actions[0]);
    if (!/ResponseInterface/.test(src) || !/__invoke/.test(src)) {
      return fail('HealthAction must implement __invoke(): ResponseInterface');
    }
    return ok(actions[0]);
  }),

  check('no-yii2', 'No Yii 2 facades, yii\\ namespaces, or #[Override]', ({ changed }) => {
    const re = /Yii::\$app|\buse\s+yii\\|#\[Override\]/;
    const bad = php(changed).filter((c) => re.test(read(c.abs)));
    return bad.length ? fail(bad.map((b) => b.path).join(', ')) : ok();
  }),
];
