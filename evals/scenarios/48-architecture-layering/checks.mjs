import { check, ok, fail, read, filesMatching } from '../../lib/checks.mjs';

const php = (changed) => changed.filter((c) => c.path.endsWith('.php'));

/**
 * Added interface declarations under src/Domain/ in the App\Domain namespace
 * (guide core-architecture-alignment.md §2.1: domain port interfaces are owned
 * by the Domain layer), with the short name and declared method names.
 */
const domainInterfaces = (changed) =>
  changed
    .filter((c) => c.added && /^src\/Domain\/.*\.php$/.test(c.path))
    .map((c) => ({ path: c.path, t: read(c.abs) }))
    .filter(({ t }) => /namespace\s+App\\Domain\\/.test(t) && /\binterface\s+\w+/.test(t))
    .map(({ path, t }) => ({
      path,
      name: t.match(/\binterface\s+(\w+)/)[1],
      methods: [...t.matchAll(/\bfunction\s+(\w+)\s*\(/g)].map((m) => m[1]),
    }));

/** An infrastructure class implements the domain-owned interface: use-import of the
 * App\Domain\... interface plus a short `implements` (or a fully-qualified implements)
 * — same predicate style as scenario 32. */
const implementsDomainInterface = (t, name) => {
  const imported = new RegExp(`use\\s+App\\\\Domain\\\\[\\w\\\\]*\\b${name}\\s*;`).test(t);
  const implementsShort = new RegExp(`implements\\s+[^;{]*\\b${name}\\b`).test(t);
  const implementsFqcn = new RegExp(`implements\\s+[^;{]*\\\\App\\\\Domain\\\\[\\w\\\\]*\\b${name}\\b`).test(t);
  return (imported && implementsShort) || implementsFqcn;
};

/** Infrastructure classes changed by the agent that implement a domain interface,
 * with their short class names. */
const infrastructureAdapters = (changed, ifs) =>
  changed
    .filter((c) => /^src\/Infrastructure\/.*\.php$/.test(c.path))
    .map((c) => ({ path: c.path, t: read(c.abs) }))
    .filter(({ t }) => ifs.some(({ name }) => implementsDomainInterface(t, name)))
    .map(({ path, t }) => ({ path, name: t.match(/\bclass\s+(\w+)/)?.[1] ?? '' }));

/** ALL domain files in the work dir (changed or not): the fixture carries the violations,
 * so an untouched offending file must still fail these scans. */
const domainFiles = (dir) =>
  filesMatching(dir, /^src\/Domain\/.*\.php$/).map((p) => ({ path: p.replace(/\\/g, '/'), t: read(p) }));

export default [
  // Guide §2.1: Domain owns port interfaces ("DbUserRepository implements UserRepositoryInterface" lives in Infrastructure).
  check('domain-interface-created', 'A new interface is declared in the App\\Domain namespace (added file under src/Domain/)', ({ changed }) => {
    const ifs = domainInterfaces(changed);
    return ifs.length ? ok(ifs.map((i) => `${i.name} (${i.path})`).join(', ')) : fail('no added interface under src/Domain/ in the App\\Domain namespace');
  }),

  // The abstraction must carry the operation the domain actually consumes.
  check('interface-declares-consumed-method', 'The new domain interface declares the operation the service consumes (a changed src/Domain file calls a method declared on it)', ({ changed }) => {
    const ifs = domainInterfaces(changed);
    if (!ifs.length) return fail('no domain interface to check methods against');
    const domainChanged = changed.filter((c) => /^src\/Domain\/.*\.php$/.test(c.path)).map((c) => read(c.abs)).join('\n');
    for (const i of ifs) {
      if (!i.methods.length) return fail(`${i.name} declares no methods`);
      const consumed = i.methods.filter((m) => new RegExp(`->\\s*${m}\\s*\\(`).test(domainChanged));
      if (consumed.length) return ok(`${i.name}::${consumed.join('/')}() called from changed domain code`);
    }
    return fail(`no method declared on ${ifs.map((i) => i.name).join('/')} is called from a changed src/Domain file`);
  }),

  // Guide §2.1: "Outbound vendor adapters live exclusively here (DbUserRepository implements UserRepositoryInterface)".
  check('infrastructure-implements-domain-interface', 'An infrastructure adapter implements the domain-owned interface (use-import + implements, or fully-qualified)', ({ changed }) => {
    const ifs = domainInterfaces(changed);
    if (!ifs.length) return fail('no domain interface found');
    const adapters = infrastructureAdapters(changed, ifs);
    return adapters.length
      ? ok(adapters.map((a) => `${a.name} implements the domain interface (${a.path})`).join(', '))
      : fail(`no changed src/Infrastructure class implements ${ifs.map((i) => i.name).join('/')}`);
  }),

  // Guide §2.1/§5: the Domain must not depend on Infrastructure; composition root is config/ (§3.3).
  // Scans the whole work-dir Domain tree so an untouched fixture violation still fails.
  check('no-infrastructure-imports-in-domain', 'No src/Domain file references App\\Infrastructure\\ (the domain depends only on abstractions it owns)', ({ dir }) => {
    const bad = domainFiles(dir).filter(({ t }) => /App\\Infrastructure\\/.test(t));
    return bad.length
      ? fail(`domain files still reference the infrastructure namespace: ${bad.map((b) => b.path).join(', ')}`)
      : ok();
  }),

  check('no-new-gateway-in-domain', 'No `new ...Gateway(` instantiation inside src/Domain files (which adapter runs is composed in the container, not built by the domain)', ({ dir }) => {
    const bad = domainFiles(dir).filter(({ t }) => /new\s+\\?[\w\\]*Gateway\s*\(/.test(t));
    return bad.length
      ? fail(`direct gateway instantiation in domain code: ${bad.map((b) => b.path).join(', ')}`)
      : ok();
  }),

  // Guide §3.3: composition root in config/ — "All dependency injection wiring ... reside strictly in config/".
  check('di-binding-added', 'A config/ DI file binds the domain interface to the infrastructure adapter (Interface::class => Adapter::class or definition array)', ({ dir, changed }) => {
    const ifs = domainInterfaces(changed);
    if (!ifs.length) return fail('no domain interface found to bind');
    const adapterNames = infrastructureAdapters(changed, ifs).map((a) => a.name).filter(Boolean);
    if (!adapterNames.length) return fail('no infrastructure adapter implementing the interface found');
    for (const f of filesMatching(dir, /^config\/.*\.php$/)) {
      const t = read(f);
      for (const { name } of ifs) {
        const k = t.search(new RegExp(`\\b${name}::class\\s*=>`));
        if (k === -1) continue;
        const window = t.slice(k, k + 200);
        const impl = adapterNames.find((n) => new RegExp(`\\b${n}::class`).test(window));
        if (impl) return ok(`${name}::class => ${impl}::class bound in config/`);
      }
    }
    return fail(`no config/ DI file binds ${ifs.map((i) => i.name).join('/')}::class to an infrastructure adapter`);
  }),

  // Guide §2.1: Domain "Must never import ... PSR HTTP classes"; §3.1 keeps request-body
  // hydration in Presentation. Scans the whole work-dir Domain tree (untouched violations fail).
  check('domain-free-of-presentation-tokens', 'Domain files import no PSR-7 HTTP classes and read no request superglobals (input stays in the presentation layer)', ({ dir }) => {
    const bad = domainFiles(dir).filter(({ t }) => /Psr\\Http\\|\$_(POST|GET|REQUEST|SERVER|COOKIE|SESSION)\b/.test(t));
    return bad.length
      ? fail(`presentation tokens inside the domain: ${bad.map((b) => b.path).join(', ')}`)
      : ok();
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

  check('transcript-mentions-abstraction', 'The final answer explains the domain-owned interface / dependency inversion', ({ transcript }) =>
    /interface/i.test(transcript) && /layer|invers|domain|infrastructur/i.test(transcript)
      ? ok()
      : fail('transcript does not mention the interface/layering fix')),
];
