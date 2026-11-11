import { check, ok, fail, read, filesMatching, matchParen, methodBody } from '../../lib/checks.mjs';

const php = (changed) => changed.filter((c) => c.path.endsWith('.php'));
const added = (changed, re) => changed.filter((c) => c.added && re.test(c.path));

export default [
  check('migration-reversible', 'New migration in migrations/ with a non-empty down()', ({ changed }) => {
    const m = added(changed, /^migrations\/.*\.php$/);
    if (!m.length) return fail('no new migration');
    const bad = m.filter((f) => {
      const body = methodBody(read(f.abs), 'down');
      return !body || !/\b(drop|delete)\w*\(/i.test(body);
    });
    return bad.length ? fail(`down() empty or missing: ${bad.map((b) => b.path)}`) : ok(m.map((x) => x.path).join(', '));
  }),

  check('interface-bound', 'Every new *Interface is bound in config/**/di/*.php', ({ changed, dir }) => {
    const ifaces = added(changed, /^src\/.*Interface\.php$/).map((f) => f.path.split('/').pop().replace('.php', ''));
    if (!ifaces.length) return fail('no new interfaces found (a repository is expected)');
    const di = filesMatching(dir, /^config\/.*\/di\/.*\.php$|^config\/.*\/di\.php$/).map(read).join('\n');
    const unbound = ifaces.filter((i) => !new RegExp(`\\b${i}::class`).test(di));
    return unbound.length ? fail(`not bound: ${unbound}`) : ok(ifaces.join(', '));
  }),

  check('route-ctor-style', 'The POST comments route is declared via new Route\\Post(...), without Route::post()/Group::create()', ({ changed }) => {
    const routes = changed.filter((c) => /^config\/.*routes.*\.php$/.test(c.path)).map((c) => read(c.abs)).join('\n');
    if (/Route::(get|post|put|delete|patch)\s*\(|Group::create\s*\(/.test(routes)) return fail('legacy static router API used');
    return /new\s+\\?(?:Yiisoft\\Router\\Route\\)?Post\s*\(\s*['"][^'"]*comments/.test(routes) ? ok() : fail('no new Post(\'.../comments\')');
  }),

  check('action-thin', 'New Actions contain no SQL, createCommand, transaction()', ({ changed }) => {
    const actions = php(changed).filter((c) => /Action\.php$/.test(c.path));
    if (!actions.length) return fail('no Action found');
    const bad = actions.filter((a) => /createCommand|->transaction\(|new\s+Query\b|->insert\(|ActiveRecord/.test(read(a.abs)));
    return bad.length ? fail(bad.map((b) => b.path).join(', ')) : ok();
  }),

  check('event-after-commit', 'dispatch() is called after transaction() returns, not inside the closure', ({ changed }) => {
    const changedPhp = php(changed);
    const hasDispatch = changedPhp.some((c) => /->dispatch\s*\(/.test(read(c.abs)));
    if (!hasDispatch) return fail('no domain event dispatch() call found in changed files');
    const offenders = [];
    for (const c of changedPhp) {
      const t = read(c.abs);
      if (!/->dispatch\s*\(/.test(t)) continue;
      const txRe = /->transaction\s*\(/g;
      let m;
      while ((m = txRe.exec(t)) !== null) {
        const open = t.indexOf('(', m.index);
        const close = matchParen(t, open);
        if (close === -1) continue;
        if (/->dispatch\s*\(/.test(t.slice(open, close))) {
          offenders.push(`${c.path}: dispatch inside the transaction() closure`);
        }
      }
    }
    return offenders.length ? fail(offenders.join('; ')) : ok();
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

  check('report-present', 'The answer contains: Feature mode, Architecture:, Finale report', ({ transcript }) => {
    const need = [/\bFeature\b/, /Architecture:/, /production readiness gate/i];
    const miss = need.filter((r) => !r.test(transcript)).map(String);
    return miss.length ? fail(`missing from transcript: ${miss}`) : ok();
  }),
];
