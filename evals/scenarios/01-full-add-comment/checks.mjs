import { check, ok, fail, read, matchParen } from '../../lib/checks.mjs';
import { noYii2Check, strictTypesCheck, overrideAdvisoryCheck, interfaceBoundCheck, migrationReversibleCheck, dispatchAfterCommitCheck } from '../../lib/shared-checks.mjs';

const php = (changed) => changed.filter((c) => c.path.endsWith('.php'));
const added = (changed, re) => changed.filter((c) => c.added && re.test(c.path));

export default [
  migrationReversibleCheck(),

  interfaceBoundCheck({ stemMatch: true, noInterfacesMessage: 'no new interfaces found (a repository is expected)' }),

  check('route-ctor-style', 'The POST comments route is declared via new Route\\Post(...) wired to the added Action (no Route::post()/Group::create())', ({ changed }) => {
    const routes = changed.filter((c) => /^config\/.*routes.*\.php$/.test(c.path)).map((c) => read(c.abs)).join('\n');
    if (/Route::(get|post|put|delete|patch)\s*\(|Group::create\s*\(/.test(routes)) return fail('legacy static router API used');
    const m = /new\s+\\?(?:Yiisoft\\Router\\Route\\)?Post\s*\(/.exec(routes);
    if (!m) return fail("no new Post('...') route declared");
    const open = routes.indexOf('(', m.index);
    const close = matchParen(routes, open);
    if (close === -1) return fail('unterminated Post(...) call');
    const args = routes.slice(open, close);
    if (!/['"][^'"]*comments['"]/.test(args)) return fail('the Post route does not target /comments');
    if (!/action\s*:\s*\\?[\w\\]*Action::class/.test(args)) return fail('the Post route is not wired to an Action class (action: ...::class)');
    return ok();
  }),

  check('action-thin', 'New Actions contain no SQL, createCommand, transaction()', ({ changed }) => {
    const actions = php(changed).filter((c) => /Action\.php$/.test(c.path));
    if (!actions.length) return fail('no Action found');
    const bad = actions.filter((a) => /createCommand|->transaction\(|new\s+Query\b|->insert\(|ActiveRecord/.test(read(a.abs)));
    return bad.length ? fail(bad.map((b) => b.path).join(', ')) : ok();
  }),

  dispatchAfterCommitCheck(),

  noYii2Check(),
  overrideAdvisoryCheck(),

  strictTypesCheck(),

  check('tests-added', 'Tests added (tests/**Test.php)', ({ changed }) =>
    added(changed, /^tests\/.*Test\.php$/).length ? ok() : fail('no tests'), { required: false }),

  check('report-present', 'The answer contains: Feature mode, Architecture:, Finale report', ({ transcript }) => {
    const need = [/\bFeature\b/, /Architecture:/, /production readiness gate/i];
    const miss = need.filter((r) => !r.test(transcript)).map(String);
    return miss.length ? fail(`missing from transcript: ${miss}`) : ok();
  }),
];
