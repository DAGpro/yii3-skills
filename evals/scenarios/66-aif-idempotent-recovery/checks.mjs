import { check, ok, fail, read, filesMatching, validateAifGateResult } from '../../lib/checks.mjs';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const php = (changed) => changed.filter((c) => c.path.endsWith('.php'));

export default [
  check('no-duplicate-migrations', 'Does not generate duplicate migrations for already existing order table', ({ dir }) => {
    const migrations = filesMatching(dir, /M\d+.*\.php$/);
    const orderMigrations = migrations.filter((f) => {
      const content = read(f);
      return /createTable\s*\(\s*['"]order['"]/i.test(content);
    });
    if (orderMigrations.length > 1) {
      return fail(`detected duplicate migration creating order table: found ${orderMigrations.length} migrations`);
    }
    return ok(`single migration preserved (${migrations.length} migration file)`);
  }),

  check('no-duplicate-di-bindings', 'Does not add redundant/duplicate DI bindings for OrderRepositoryInterface', ({ dir }) => {
    const diFiles = filesMatching(dir, /config\/.*\/di\/.*\.php$/);
    let occurrences = 0;
    const foundLocations = [];
    for (const file of diFiles) {
      const content = read(file);
      const matches = [...content.matchAll(/OrderRepositoryInterface::class/gi)];
      if (matches.length > 0) {
        occurrences += matches.length;
        foundLocations.push(`${file} (${matches.length}x)`);
      }
    }
    if (occurrences > 1) {
      return fail(`OrderRepositoryInterface bound redundantly in ${occurrences} places: ${foundLocations.join(', ')}`);
    }
    if (occurrences === 0) {
      return fail('OrderRepositoryInterface binding disappeared from config');
    }
    return ok('OrderRepositoryInterface bound exactly once');
  }),

  check('no-duplicate-routes', 'Route /api/orders/{id}/cancel is registered exactly once in config/routes.php', ({ dir }) => {
    const routeFile = join(dir, 'config', 'routes.php');
    if (!existsSync(routeFile)) return fail('config/routes.php not found');
    const content = read(routeFile);
    const matches = [...content.matchAll(/orders\/\{id\}\/cancel/gi)];
    if (matches.length === 0) return fail('cancel route was not registered');
    if (matches.length > 1) return fail(`cancel route registered duplicate times (${matches.length} times)`);
    return ok('cancel route registered exactly once');
  }),

  check('action-created', 'CancelOrderAction exists and returns Psr\\Http\\Message\\ResponseInterface', ({ dir }) => {
    const actionPath = join(dir, 'src', 'Order', 'CancelOrderAction.php');
    if (!existsSync(actionPath)) return fail('CancelOrderAction.php not found');
    const content = read(actionPath);
    if (!/ResponseInterface/.test(content)) {
      return fail('CancelOrderAction does not return ResponseInterface');
    }
    if (!/OrderRepositoryInterface/.test(content)) {
      return fail('CancelOrderAction does not inject OrderRepositoryInterface');
    }
    return ok('CancelOrderAction is thin HTTP action injecting repository contract');
  }),

  check('input-dto-validated', 'CancelOrderDto exists with validated typed properties', ({ dir }) => {
    const dtoPath = join(dir, 'src', 'Order', 'CancelOrderDto.php');
    if (!existsSync(dtoPath)) return fail('CancelOrderDto.php not found');
    const content = read(dtoPath);
    if (!/(?:#[A-Za-z]+|Validator|Rule)/.test(content)) {
      return fail('CancelOrderDto has no validation attributes');
    }
    return ok('CancelOrderDto has validated properties');
  }),

  check('no-yii2', 'No legacy Yii2 facades used', ({ changed }) => {
    for (const c of php(changed)) {
      if (/Yii::\$app/i.test(read(c.abs))) {
        return fail(`${c.path} uses forbidden Yii::$app`);
      }
    }
    return ok();
  }),

  check('aif-gate-result-emitted', 'Valid aif-gate-result JSON emitted per AI Factory 2.x schema', ({ transcript }) =>
    validateAifGateResult(transcript, { expectedStatus: 'pass', terminal: true })),
];
