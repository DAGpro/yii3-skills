import { check, ok, fail, read } from '../../lib/checks.mjs';
import { noYii2Check, strictTypesCheck, overrideAdvisoryCheck } from '../../lib/shared-checks.mjs';
import { ruleAttributeAttachment, stripPhpComments } from '../../lib/semantic.mjs';

const php = (changed) => changed.filter((c) => c.path.endsWith('.php'));
const added = (changed, re) => changed.filter((c) => c.added && re.test(c.path));
const actions = (changed) => php(changed).filter((c) => /Action\.php$/.test(c.path));

export default [
  check('input-dto-validated', 'A typed input DTO (AbstractInput + #[FromBody] or typed DTO) with validator rule attributes attached to properties, wired into the Action - not merely declared', ({ changed }) => {
    const dtos = added(changed, /^src\/.*\.php$/).map((c) => ({ path: c.path, t: read(c.abs) }))
      .filter(({ t }) => /class\s+\w*(Input|Dto)\b/i.test(t)
        || /use\s+Yiisoft\\Input\\Http\\AbstractInput;/.test(t)
        || /extends\s+\\?AbstractInput\b/.test(t)
        || /#\[FromBody\]/.test(t));
    if (!dtos.length) return fail('no new typed input DTO class created');
    const problems = [];
    const validated = [];
    for (const d of dtos) {
      const attach = ruleAttributeAttachment(stripPhpComments(d.t));
      if (!attach.total) {
        problems.push(`${d.path}: no validator rule attributes (docblock mentions do not count)`);
        continue;
      }
      if (attach.detached.length) {
        problems.push(`${d.path}: rule attribute(s) not attached to a property: ${attach.detached.join(', ')}`);
        continue;
      }
      const short = d.path.split('/').pop().replace(/\.php$/, '');
      // wired = referenced outside import lines in a changed non-test file (a bare
      // `use X;` import does not count as usage - audit mutant probe)
      const wired = php(changed).some((c) => !c.path.endsWith(short + '.php') && !/^tests\//.test(c.path)
        && stripPhpComments(read(c.abs)).split('\n').filter((l) => !/^\s*use\s+[\w\\]+;\s*$/.test(l)).join('\n').includes(short));
      if (!wired) {
        problems.push(`${d.path}: DTO is not referenced by any changed non-test file (declared but not wired)`);
        continue;
      }
      validated.push(d.path);
    }
    return validated.length && !problems.length
      ? ok(validated.join(', '))
      : fail(problems.length ? problems.join('; ') : 'no validated input DTO');
  }),

  check('action-typed-input', 'The Action receives or resolves typed input (type-hinted parameter or injected hydrator/validator)', ({ changed }) => {
    const hit = actions(changed).filter((c) => {
      const code = read(c.abs);
      return /public\s+function\s+__invoke\s*\([^)]*\b\w*(Input|Dto)\s+\$/.test(code)
        || /HydratorInterface\s+\$\w+/.test(code)
        || /ValidatorInterface\s+\$\w+/.test(code);
    });
    return hit.length ? ok() : fail('no Action method argument type-hinted Input/Dto or injected hydrator/validator');
  }),

  check('no-raw-parsed-body', 'No raw body digging in Actions (any getParsedBody(), $_POST, ->post(...)) - input-http resolves typed inputs', ({ changed }) => {
    const re = /getParsedBody\(|\$_POST|\$request->post\(|\$_GET|\$request->get\(/;
    const bad = actions(changed).filter((c) => re.test(read(c.abs)));
    return bad.length ? fail(`raw input access: ${bad.map((b) => b.path).join(', ')}`) : ok();
  }),

  check('route-added', 'POST /settings route declared via new Route\\Post(...) (lock pins router 4.0.3)', ({ changed }) => {
    const routes = changed.filter((c) => /^config\/.*routes.*\.php$/.test(c.path)).map((c) => read(c.abs)).join('\n');
    if (/Route::(get|post|put|delete|patch)\s*\(|Group::create\s*\(/.test(routes)) return fail('legacy static router API used');
    return /new\s+\\?(?:Yiisoft\\Router\\Route\\)?Post\s*\(\s*['"][^'"]*settings/.test(routes) ? ok() : fail('no new Post(\'...settings\')');
  }),

  check('action-thin', 'New Actions contain no SQL, createCommand, transaction()', ({ changed }) => {
    const hits = actions(changed);
    if (!hits.length) return fail('no Action found');
    const bad = hits.filter((a) => /createCommand|->transaction\(|new\s+Query\b|->insert\(|ActiveRecord/.test(read(a.abs)));
    return bad.length ? fail(bad.map((b) => b.path).join(', ')) : ok();
  }),

  noYii2Check(),
  overrideAdvisoryCheck(),

  strictTypesCheck(),

  check('tests-added', 'Tests added (tests/**Test.php)', ({ changed }) =>
    changed.some((c) => c.added && /^tests\/.*Test\.php$/.test(c.path)) ? ok() : fail('no tests'), { required: false }),
];
