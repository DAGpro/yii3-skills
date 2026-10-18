import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const script = path.join(root, 'skills/yii3/scripts/yii3-context.mjs');
const fx = path.join(root, 'tests/fixtures/yii3-app');
const run = (...a) => JSON.parse(execFileSync('node', [script, ...a], { encoding: 'utf8' }));
let n = 0; const t = (name, fn) => { fn(); n++; console.log('✓', name); };

t('detects Yii3 + architecture artifact from config.yaml', () => {
  const r = run('--root', fx);
  assert.equal(r.yii3, true);
  assert.deepEqual(r.architecture, { path: 'docs/ARCH.md', exists: true, source: 'artifact' });
  assert.equal(r.packages.find((p) => p.name === 'yiisoft/di').locked, '1.3.0');
});
t('falls back to inferred layout when artifact is missing', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'y3-'));
  fs.cpSync(fx, tmp, { recursive: true }); fs.rmSync(path.join(tmp, 'docs'), { recursive: true });
  const r = run('--root', tmp);
  assert.equal(r.architecture.source, 'inferred');
  assert.ok(r.architecture.layout.src.Web.Home !== undefined);
});
t('--need: missing package, companion, driver choice, unknown key', () => {
  const r = run('--root', fx, '--need', 'queue,router,db,nope');
  const by = Object.fromEntries(r.needs.map((x) => [x.key, x]));
  assert.equal(by.queue.composer, 'composer require yiisoft/queue');
  assert.deepEqual(by.router.missing, ['yiisoft/router-fastroute']);
  assert.ok(by.db.choice.options.includes('yiisoft/db-pgsql') && by.db.action);
  assert.ok(by.nope.error);
});
t('--scan finds unknown namespace, transitive dep, Yii2 API, missing strict_types', () => {
  const r = run('--root', fx, '--scan', path.join(fx, 'src/Web/Home/Action.php'), path.join(fx, 'src/Domain/Legacy.php'));
  const types = r.scan.findings.map((f) => f.type).sort();
  assert.deepEqual(types, ['missing-strict-types', 'transitive-dependency', 'unknown-yiisoft-namespace', 'yii2-api', 'yii2-api']);
});
t('Yii2 project and empty dir are not Yii3', () => {
  const y2 = fs.mkdtempSync(path.join(os.tmpdir(), 'y2-')); fs.writeFileSync(path.join(y2, 'composer.json'), '{"require":{"yiisoft/yii2":"~2.0"}}');
  assert.equal(run('--root', y2).yii3, false);
  assert.equal(run('--root', fs.mkdtempSync(path.join(os.tmpdir(), 'e-'))).yii3, false);
});
console.log(`${n} tests passed`);
