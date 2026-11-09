import { check, ok, fail, read, filesMatching, matchParen, matchBrace, methodBody } from '../../lib/checks.mjs';

const php = (changed) => changed.filter((c) => c.path.endsWith('.php'));
const added = (changed, re) => changed.filter((c) => c.added && re.test(c.path));

export default [
  check('plan-resolved', 'Stage 0 resolves plan artifact and architecture from .ai-factory/', ({ transcript }) => {
    const hasPlan = /\.ai-factory\/plans\/|newsletter-subscription/i.test(transcript);
    const hasArch = /Architecture:.*(\.ai-factory|Vertical Slice)/i.test(transcript);
    if (!hasPlan) return fail('plan artifact path not resolved in transcript');
    if (!hasArch) return fail('architecture artifact not resolved in transcript');
    return ok();
  }),

  check('mission-state-tracker', 'Mission State tracker printed before implementation', ({ transcript }) => {
    const hasTracker = /###\s*Mission State/i.test(transcript);
    const hasMode = /Mode:?\*{0,2}\s*(Feature|Enterprise|Full)/i.test(transcript);
    const hasDecomp = /Mode:?\*{0,2}\s*(Feature|Enterprise)/i.test(transcript) || /Decomposition:?\*{0,2}\s*(Full|Standard)/i.test(transcript);
    if (!hasTracker) return fail('missing ### Mission State');
    if (!hasMode) return fail('missing Mode in tracker');
    if (!hasDecomp) return fail('missing Decomposition in tracker');
    return ok();
  }),

  check('migration-reversible', 'New migration in migrations/ with reversible down()', ({ changed }) => {
    const m = added(changed, /^migrations\/.*\.php$/);
    if (!m.length) return fail('no new migration found');
    const bad = m.filter((f) => {
      const body = methodBody(read(f.abs), 'down');
      return !body || !/\b(drop|delete)\w*\(/i.test(body);
    });
    return bad.length ? fail(`down() empty or missing: ${bad.map((b) => b.path)}`) : ok(m.map((x) => x.path).join(', '));
  }),

  check('interface-bound', 'Every new *Interface is bound in config/common/di/*.php', ({ changed, dir }) => {
    const ifaces = added(changed, /^src\/.*Interface\.php$/).map((f) => f.path.split('/').pop().replace('.php', ''));
    if (!ifaces.length) return fail('no new interfaces found');
    const di = filesMatching(dir, /^config\/.*\/di\/.*\.php$|^config\/.*\/di\.php$/).map(read).join('\n');
    const unbound = ifaces.filter((i) => !new RegExp(`\\b${i}::class`).test(di));
    return unbound.length ? fail(`not bound: ${unbound.join(', ')}`) : ok(ifaces.join(', '));
  }),

  check('route-mounted', 'POST /newsletter/subscribe route declared with new Route\\Post', ({ changed }) => {
    const routes = changed.filter((c) => /^config\/.*routes.*\.php$/.test(c.path)).map((c) => read(c.abs)).join('\n');
    if (/Route::post/i.test(routes)) return fail('legacy static Route::post() used');
    return /new\s+\\?(?:Yiisoft\\Router\\Route\\)?Post\s*\(\s*['"][^'"]*newsletter/i.test(routes)
      ? ok()
      : fail('no new Post(...) route mounted for newsletter');
  }),

  check('action-thin', 'SubscribeAction contains no direct persistence or transactions', ({ changed }) => {
    const actions = php(changed).filter((c) => /Action\.php$/.test(c.path));
    if (!actions.length) return fail('no Action found');
    const bad = actions.filter((a) => /createCommand|->transaction\(|new\s+Query\b|->insert\(|ActiveRecord/.test(read(a.abs)));
    return bad.length ? fail(bad.map((b) => b.path).join(', ')) : ok();
  }),

  check('event-after-commit', 'Event dispatch() is called outside/after transaction returns', ({ changed }) => {
    const changedPhp = php(changed);
    const hasDispatch = changedPhp.some((c) => /->dispatch\s*\(/.test(read(c.abs)));
    if (!hasDispatch) return fail('no event dispatch() call found in changed files');
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

  check('aif-gate-result-emitted', 'Valid aif-gate-result JSON emitted per AI Factory 2.x schema', ({ transcript }) => {
    const marker = transcript.indexOf('aif-gate-result:');
    if (marker === -1) return fail('no aif-gate-result marker found in transcript');
    const openIdx = transcript.indexOf('{', marker);
    if (openIdx === -1) return fail('no opening { after aif-gate-result');
    const closeIdx = matchBrace(transcript, openIdx);
    if (closeIdx === -1) return fail('no matching closing } for aif-gate-result JSON');
    const jsonStr = transcript.slice(openIdx, closeIdx + 1);
    try {
      const parsed = JSON.parse(jsonStr);
      if (parsed.status !== 'pass') return fail(`expected status pass, got ${parsed.status}`);
      if (parsed.schema_version !== 1) return fail(`expected schema_version 1, got ${parsed.schema_version}`);
      if (parsed.gate !== 'verify') return fail(`expected gate "verify", got ${parsed.gate}`);
      if (parsed.blocking !== false) return fail(`expected blocking false, got ${parsed.blocking}`);
      if (!Array.isArray(parsed.blockers) || parsed.blockers.length > 0) return fail(`expected empty blockers, got ${JSON.stringify(parsed.blockers)}`);
      if (!Array.isArray(parsed.affected_files) || parsed.affected_files.length === 0) return fail('affected_files missing or empty');
      if (!parsed.suggested_next || typeof parsed.suggested_next !== 'object') return fail('suggested_next missing or invalid');
      return ok();
    } catch (e) {
      return fail(`invalid aif-gate-result JSON: ${e.message}`);
    }
  }),

  check('tests-added', 'Tests added in tests/Newsletter/', ({ changed }) =>
    added(changed, /^tests\/.*Test\.php$/).length ? ok() : fail('no tests'), { required: false }),
];

