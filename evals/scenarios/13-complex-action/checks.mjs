import { check, ok, fail, read } from '../../lib/checks.mjs';

const php = (changed) => changed.filter((c) => c.path.endsWith('.php'));
const added = (changed, re) => changed.filter((c) => c.added && re.test(c.path));
const actions = (changed) => php(changed).filter((c) => /Action\.php$/.test(c.path));

export default [
  check('input-dto-validated', 'A typed input DTO (AbstractInput + #[FromBody]) with validator rule attributes (#[Validate(new Length/Integer/Required/...)])', ({ changed }) => {
    const dtos = added(changed, /^src\/.*\.php$/).map((c) => ({ path: c.path, t: read(c.abs) }))
      .filter(({ t }) => (/use\s+Yiisoft\\Input\\Http\\AbstractInput;/.test(t) && /extends\s+\\?AbstractInput\b/.test(t))
        || /extends\s+\\?Yiisoft\\Input\\Http\\AbstractInput\b/.test(t));
    if (!dtos.length) return fail('no new class extends Yiisoft\\Input\\Http\\AbstractInput');
    const withBody = dtos.filter(({ t }) => /#\[FromBody\]/.test(t));
    if (!withBody.length) return fail('no #[FromBody] on the input DTO');
    const validated = withBody.filter(({ t }) => /#\[Validate\(\s*new\s+(Length|Integer|Required|Number|StringValue|Count|Email)\(/.test(t));
    return validated.length ? ok(validated.map((v) => v.path).join(', ')) : fail('no #[Validate(new ...)] rule attributes on the input DTO');
  }),

  check('action-typed-input', 'The Action receives the typed input as a method argument (input-http resolves it)', ({ changed }) => {
    const hit = actions(changed).filter((c) => /public\s+function\s+__invoke\s*\([^)]*\b\w*Input\s+\$/.test(read(c.abs)));
    return hit.length ? ok() : fail('no Action method argument type-hinted *Input');
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
    changed.some((c) => c.added && /^tests\/.*Test\.php$/.test(c.path)) ? ok() : fail('no tests'), { required: false }),
];
