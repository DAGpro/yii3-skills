import { check, ok, fail, read, filesMatching, methodBody } from '../../lib/checks.mjs';

const php = (changed) => changed.filter((c) => c.path.endsWith('.php'));
const added = (changed, re) => changed.filter((c) => c.added && re.test(c.path));
const app = (changed) => php(changed).filter((c) => !/^tests\//.test(c.path));

export default [
  check('no-second-mechanism', 'No second persistence mechanism (raw db Command/Query or Cycle) next to the existing Active Record stack', ({ changed }) => {
    const re = /Yiisoft\\Cycle|Cycle\\ORM|createCommand\(|new\s+Query\b/;
    const bad = app(changed).filter((c) => re.test(read(c.abs)));
    return bad.length ? fail(`second mechanism used: ${bad.map((b) => b.path).join(', ')}`) : ok();
  }),

  check('uses-active-record', 'New model extends the project\'s existing Active Record stack', ({ changed }) => {
    // Either a fully-qualified extends or an import + short extends (the common idiom).
    const isAr = (t) => (/use\s+Yiisoft\\ActiveRecord\\ActiveRecord;/.test(t) && /extends\s+\\?ActiveRecord\b/.test(t))
      || /extends\s+\\?Yiisoft\\ActiveRecord\\ActiveRecord\b/.test(t);
    return app(changed).some((c) => isAr(read(c.abs))) ? ok() : fail('no new class extends Yiisoft\\ActiveRecord\\ActiveRecord');
  }),

  check('interface-bound', 'Every new *Interface is bound in config/**/di/*.php', ({ changed, dir }) => {
    const ifaces = added(changed, /^src\/.*Interface\.php$/).map((f) => f.path.split('/').pop().replace('.php', ''));
    if (!ifaces.length) return fail('no new interfaces found (a repository is expected)');
    const di = filesMatching(dir, /^config\/.*\/di\/.*\.php$|^config\/.*\/di\.php$/).map(read).join('\n');
    const unbound = ifaces.filter((i) => !new RegExp(`\\b${i}::class`).test(di));
    return unbound.length ? fail(`not bound: ${unbound}`) : ok(ifaces.join(', '));
  }),

  check('route-added', 'GET /tags route declared via new Route\\Get(...) (lock pins router 4.0.3), no static API', ({ changed }) => {
    const routes = changed.filter((c) => /^config\/.*routes.*\.php$/.test(c.path)).map((c) => read(c.abs)).join('\n');
    if (/Route::(get|post|put|delete|patch)\s*\(|Group::create\s*\(/.test(routes)) return fail('legacy static router API used');
    return /new\s+\\?(?:Yiisoft\\Router\\Route\\)?Get\s*\(\s*['"][^'"]*tags/.test(routes) ? ok() : fail('no new Get(\'...tags\')');
  }),

  check('migration-reversible', 'New migration in migrations/ with a non-empty down()', ({ changed }) => {
    const m = added(changed, /^migrations\/.*\.php$/);
    if (!m.length) return fail('no new migration');
    const bad = m.filter((f) => {
      const body = methodBody(read(f.abs), 'down');
      return !body || !/\b(drop|delete)\w*\(/i.test(body);
    });
    return bad.length ? fail(`down() empty or missing: ${bad.map((b) => b.path)}`) : ok(m.map((x) => x.path).join(', '));
  }),

  check('no-yii2', 'No Yii2 constructs or #[Override] in changed PHP files', ({ changed }) => {
    const re = /Yii::\$app|\buse\s+yii\\|#\[Override\]|ActiveForm::begin|->getFlash\(/;
    const bad = php(changed).filter((c) => re.test(read(c.abs)));
    return bad.length ? fail(bad.map((b) => b.path).join(', ')) : ok();
  }),

  check('strict-types', 'declare(strict_types=1) in every added PHP file', ({ changed }) => {
    const bad = php(changed).filter((c) => c.added && !/declare\(strict_types=1\);/.test(read(c.abs)));
    return bad.length ? fail(bad.map((b) => b.path).join(', ')) : ok();
  }),

  check('tests-added', 'Tests added (tests/**Test.php)', ({ changed }) =>
    added(changed, /^tests\/.*Test\.php$/).length ? ok() : fail('no tests'), { required: false }),
];
