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
    const hasMode = /Mode:?\*{0,2}\s*(Patch|Feature|Enterprise)/i.test(transcript);
    const hasArch = /Architecture:?\*{0,2}\s*[^\n\r]+/i.test(transcript);
    if (!hasTracker) return fail('missing ### Mission State');
    if (!hasMode) return fail('missing Mode in tracker');
    if (!hasArch) return fail('missing Architecture in tracker');
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
    // Strictly require the official AI Factory 2.x fenced code block with exact language tag
    const regex = /```aif-gate-result\s*\r?\n([\s\S]*?)\r?\n```/g;
    let match;
    let lastMatch = null;
    let lastJson = null;
    while ((match = regex.exec(transcript)) !== null) {
      lastMatch = match;
      lastJson = match[1].trim();
    }
    if (!lastJson || !lastMatch) {
      return fail('no valid ```aif-gate-result fenced code block found in transcript');
    }

    // Verify the block is terminal (final block in transcript)
    const trailingContent = transcript.slice(lastMatch.index + lastMatch[0].length).trim();
    if (trailingContent.length > 0) {
      return fail(`aif-gate-result must be the final block; found trailing content: "${trailingContent.slice(0, 50)}..."`);
    }

    try {
      const parsed = JSON.parse(lastJson);
      if (parsed.schema_version !== 1) return fail(`expected schema_version 1, got ${parsed.schema_version}`);
      if (parsed.gate !== 'verify') return fail(`expected gate "verify", got ${parsed.gate}`);
      if (!['pass', 'warn', 'fail'].includes(parsed.status)) return fail(`invalid status: ${parsed.status}`);
      if (typeof parsed.blocking !== 'boolean') return fail(`expected blocking boolean, got ${typeof parsed.blocking}`);
      if (!Array.isArray(parsed.blockers)) return fail('blockers must be an array');
      if (!Array.isArray(parsed.affected_files)) return fail('affected_files must be an array');

      // Validate blockers structure and reject unsupported keys (e.g. line)
      const ALLOWED_BLOCKER_KEYS = new Set(['id', 'severity', 'file', 'summary']);
      for (const b of parsed.blockers) {
        if (!b.id || typeof b.id !== 'string') return fail(`blocker missing string id: ${JSON.stringify(b)}`);
        if (!['error', 'warning'].includes(b.severity)) return fail(`blocker invalid severity: ${b.severity}`);
        if (!b.summary || typeof b.summary !== 'string') return fail(`blocker missing string summary: ${JSON.stringify(b)}`);
        for (const k of Object.keys(b)) {
          if (!ALLOWED_BLOCKER_KEYS.has(k)) {
            return fail(`blocker contains unsupported key "${k}": ${JSON.stringify(b)}`);
          }
        }
      }

      // Validate suggested_next allowlist and reason requirement
      const ALLOWED_COMMANDS = ['/aif-fix', '/aif-rules', '/aif-architecture', '/aif-roadmap', '/aif-commit', null];
      if (!parsed.suggested_next || typeof parsed.suggested_next !== 'object') {
        return fail('suggested_next must be an object');
      }
      if (!ALLOWED_COMMANDS.includes(parsed.suggested_next.command)) {
        return fail(`suggested_next.command "${parsed.suggested_next.command}" not in allowlist: ${ALLOWED_COMMANDS.join(', ')}`);
      }
      if (parsed.suggested_next.reason === undefined) {
        return fail('suggested_next missing required "reason" property');
      }
      if (typeof parsed.suggested_next.reason !== 'string' && parsed.suggested_next.reason !== null) {
        return fail('suggested_next.reason must be a string or null');
      }

      // For positive verification run (pass status expected)
      if (parsed.status !== 'pass') return fail(`expected status pass, got ${parsed.status}`);
      if (parsed.blocking !== false) return fail(`expected blocking false for pass, got ${parsed.blocking}`);
      if (parsed.blockers.length > 0) return fail(`expected empty blockers for pass, got ${JSON.stringify(parsed.blockers)}`);
      if (parsed.affected_files.length === 0) return fail('affected_files should record evaluated files');
      if (parsed.suggested_next.command !== '/aif-commit') {
        return fail(`expected suggested_next.command "/aif-commit", got ${parsed.suggested_next.command}`);
      }

      return ok();
    } catch (e) {
      return fail(`invalid aif-gate-result JSON: ${e.message}`);
    }
  }),

  check('tests-added', 'Tests added in tests/Newsletter/', ({ changed }) =>
    added(changed, /^tests\/.*Test\.php$/).length ? ok() : fail('no tests'), { required: false }),
];

