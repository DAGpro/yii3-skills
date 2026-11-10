import { join } from 'node:path';
import { check, ok, fail, read } from '../../lib/checks.mjs';

const NEWEST = 'docs/plans/2026-01-12-enable-psr16-cache.md';
const php = (changed) => changed.filter((c) => c.path.endsWith('.php'));
const added = (changed, re) => changed.filter((c) => c.added && re.test(c.path));

export default [
  check('plan-resolved-newest', 'The open task of the newest docs/plans/*.md is executed: its checkbox is completed in place', ({ dir, changed }) => {
    if (!changed.some((c) => c.path === NEWEST)) {
      return fail(`${NEWEST} untouched — standalone plan resolution is: explicit argument → root PLAN.md → newest *.md in docs/plans/|docs/plan/`);
    }
    const t = read(join(dir, NEWEST));
    return /-\s\[x\]/i.test(t) ? ok() : fail('no checkbox completed in the resolved plan');
  }),

  check('execution-state-updated', "The resolved plan's ### Execution State block is reconciled (Status advanced to COMPLETE)", ({ dir }) => {
    const t = read(join(dir, NEWEST));
    return /###\s+Execution State/i.test(t) && /Status:\s*\*{0,2}\s*COMPLETE/i.test(t)
      ? ok()
      : fail('Execution State block missing or Status not advanced to COMPLETE');
  }),

  check('no-plan-invented', 'No plan artifact invented: no new root PLAN.md and no new docs/plans|docs/plan/*.md', ({ changed }) => {
    const invented = added(changed, /^(PLAN\.md|docs\/plans\/[^/]+\.md|docs\/plan\/[^/]+\.md)$/i);
    return invented.length
      ? fail(`invented plan artifact(s): ${invented.map((c) => c.path).join(', ')} — create plan files only when the user explicitly asks to persist the mission`)
      : ok();
  }),

  check('no-aif-artifacts', 'No AI Factory artifacts: no .ai-factory/** changes, no aif-gate-result fence, no /aif-* commands in the transcript', ({ changed, transcript }) => {
    const aifFiles = changed.filter((c) => /^\.ai-factory\//.test(c.path));
    if (aifFiles.length) {
      return fail(`.ai-factory artifacts created: ${aifFiles.map((c) => c.path).join(', ')} — that block belongs exclusively to AI Factory extension mode`);
    }
    if (/```aif-gate-result/.test(transcript)) {
      return fail('transcript emits an aif-gate-result fenced block — standalone reports structured prose instead');
    }
    if (/\/aif-(verify|fix|commit|implement|plan|review|improve|roadmap|architecture|rules|qa)\b/.test(transcript)) {
      return fail('transcript hands off via /aif-* workflow commands — standalone next steps target the user');
    }
    return ok();
  }),

  check('mission-state-standalone', 'Mission State tracker printed with Context: Standalone (adapter §3: the tracker is the primary state carrier)', ({ transcript }) => {
    return /Mission State/i.test(transcript) && /Standalone/i.test(transcript)
      ? ok()
      : fail('no Mission State tracker with Standalone context');
  }),

  check('di-binding-landed', 'The PSR-16 interface is bound to FileCache in config/**/di/cache.php (wiring gate landed)', ({ changed }) => {
    const p = changed.find((c) => /^config\/.*\/di\/cache\.php$/.test(c.path));
    if (!p) return fail('config/**/di/cache.php not created — the wiring gate did not land');
    const t = read(p.abs);
    const binds =
      /Psr\\SimpleCache\\CacheInterface::class\s*=>/.test(t) ||
      (/use\s+Psr\\SimpleCache\\CacheInterface;/.test(t) && /CacheInterface::class\s*=>/.test(t));
    return binds && /FileCache::class/.test(t)
      ? ok(p.path)
      : fail(`${p.path} does not bind Psr\\SimpleCache\\CacheInterface to FileCache::class`);
  }),

  check('report-block', 'Final report carries the DoD §4 fields (Mode, Architecture, fixes applied, tests, static analysis, packages added, config files changed, production readiness gate)', ({ transcript }) => {
    const fields = ['Mode', 'Architecture', 'fixes applied', 'tests', 'static analysis', 'packages added', 'config files changed', 'production readiness gate'];
    const missing = fields.filter((f) => !new RegExp(f.replace(/ /g, '\\s+'), 'i').test(transcript));
    return missing.length ? fail(`report fields missing: ${missing.join(', ')}`) : ok();
  }),

  check('no-yii2', 'No Yii2 constructs in changed PHP files', ({ changed }) => {
    const re = /Yii::\$app|\buse\s+yii\\|#\[Override\]|->getFlash\(/;
    const bad = php(changed).filter((c) => re.test(read(c.abs)));
    return bad.length ? fail(bad.map((b) => b.path).join(', ')) : ok();
  }),

  check('strict-types', 'declare(strict_types=1) in every added PHP file', ({ changed }) => {
    const bad = php(changed).filter((c) => c.added && !/declare\(strict_types=1\);/.test(read(c.abs)));
    return bad.length ? fail(bad.map((b) => b.path).join(', ')) : ok();
  }),
];
