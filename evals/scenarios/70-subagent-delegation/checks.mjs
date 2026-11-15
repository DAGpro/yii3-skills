import { check, ok, fail, read, filesMatching, validateAifGateResult } from '../../lib/checks.mjs';
import { noYii2Check, strictTypesCheck, overrideAdvisoryCheck } from '../../lib/shared-checks.mjs';

const php = (changed) => changed.filter((c) => c.path.endsWith('.php'));
const added = (changed, re) => changed.filter((c) => c.added && re.test(c.path));

export default [
  check('context-readiness-checked', 'Context Readiness Gate is evaluated prior to delegation (core-aif-adapter.md §7.2)', ({ transcript }) => {
    const hasReadiness = /context readiness|readiness gate|condition [abc]/i.test(transcript);
    return hasReadiness ? ok() : fail('transcript does not evaluate the Context Readiness Gate before delegating to subagent');
  }),

  check('delegation-brief-anchors', 'Delegation brief incorporates all mandatory anchors: skill directive, architecture pattern, governing guide, invariants, and receipt requirement (core-aif-adapter.md §7.3)', ({ transcript }) => {
    const hasSkillDirective = /load.*['"]?yii3['"]?\s+skill/i.test(transcript);
    const hasArchitecture = /(?:project\s+)?architecture(?:\s+pattern)?\s*:\s*[^\n\r]+/i.test(transcript);
    const hasGuide = /references\/packages\/http-actions-core\.md/i.test(transcript);
    const hasInvariants = /(?:presentation isolation|zero direct sql|no static facades|constructor di)/i.test(transcript);
    const hasReceiptRequirement = /subagent execution receipt/i.test(transcript);

    const missing = [];
    if (!hasSkillDirective) missing.push('skill loading directive');
    if (!hasArchitecture) missing.push('architecture pattern');
    if (!hasGuide) missing.push('references/packages/http-actions-core.md');
    if (!hasInvariants) missing.push('mandatory presentation/DI invariants');
    if (!hasReceiptRequirement) missing.push('receipt requirement');

    return missing.length === 0 ? ok() : fail(`delegation brief missing mandatory anchors: ${missing.join(', ')}`);
  }),

  check('receipt-structured', 'Subagent returns a machine-readable Subagent Execution Receipt block (core-aif-adapter.md §7.5)', ({ transcript }) => {
    const hasReceiptHeading = /###\s+Subagent Execution Receipt/i.test(transcript);
    const hasStatus = /status:\s*\*{0,2}\s*COMPLETE/i.test(transcript);
    const hasFiles = /target files (?:created\s*\/\s*)?modified:/i.test(transcript);
    const hasSignatures = /verified api signatures:/i.test(transcript);
    const hasWiring = /verified wiring gates:/i.test(transcript);

    if (!hasReceiptHeading) return fail('missing ### Subagent Execution Receipt block');
    if (!hasStatus) return fail('receipt missing Status: COMPLETE');
    if (!hasFiles) return fail('receipt missing Target Files Modified');
    if (!hasSignatures) return fail('receipt missing Verified API Signatures');
    if (!hasWiring) return fail('receipt missing Verified Wiring Gates');

    return ok();
  }),

  check('parent-receipt-audit', 'Parent agent audits the subagent receipt (perimeter, anti-patterns, signatures, wiring gates) before accepting output (core-aif-adapter.md §7.6)', ({ transcript }) => {
    const hasPerimeter = /perimeter|authorized target/i.test(transcript);
    const hasAntiPatternCheck = /anti-pattern/i.test(transcript);
    const hasSignatureAudit = /signature|vendor\/yiisoft/i.test(transcript);

    if (!hasPerimeter && !hasAntiPatternCheck && !hasSignatureAudit) {
      return fail('no record of parent receipt verification or quality audit');
    }
    return ok();
  }),

  check('action-thin-presentation', 'UpdateBioAction is created as a thin HTTP transport adapter returning ResponseInterface with zero SQL/transactions', ({ changed }) => {
    const actionFiles = added(changed, /^src\/.*UpdateBioAction\.php$/);
    if (!actionFiles.length) return fail('src/User/Profile/UpdateBioAction.php was not created');
    const content = read(actionFiles[0].abs);

    if (!/ResponseInterface/.test(content)) return fail('Action does not declare or return ResponseInterface');
    if (/\b(?:SELECT|INSERT|UPDATE|DELETE)\b/i.test(content)) return fail('Action contains direct raw SQL queries');
    if (/\$db->transaction\(/.test(content)) return fail('Action manages database transactions directly');

    return ok(actionFiles[0].path);
  }),

  check('route-mounted', 'POST /api/user/bio route mounted in config/routes.php pointing to UpdateBioAction', ({ changed }) => {
    const routeFiles = changed.filter((c) => /^config\/.*routes.*\.php$/.test(c.path));
    if (!routeFiles.length) return fail('config/routes.php was not modified');
    const content = read(routeFiles[0].abs);

    const wiresAction = /UpdateBioAction::class/.test(content);
    const hasPostRoute = /Route::post\s*\(\s*['"]\/api\/user\/bio['"]\)/.test(content) || /new\s+Post\s*\(\s*['"]\/api\/user\/bio['"]\)/.test(content);

    if (!wiresAction) return fail('config/routes.php does not reference UpdateBioAction::class');
    if (!hasPostRoute) return fail("config/routes.php does not mount POST route '/api/user/bio'");

    return ok();
  }),

  check('aif-gate-result-emitted', 'Terminal aif-gate-result block emitted with gate: "verify" and status: "pass"', ({ transcript }) =>
    validateAifGateResult(transcript, { gate: 'verify' })),

  noYii2Check(),
  overrideAdvisoryCheck(),
  strictTypesCheck(),
];
