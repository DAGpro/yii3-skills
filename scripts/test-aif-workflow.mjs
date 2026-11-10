#!/usr/bin/env node
// AI Factory Workflow Contract Test Suite (Node >= 18, ESM, node:* stdlib only).
// Validates the integration between yii3-skills and AI Factory workflows:
// 1. Injections Canonical Guard & Structure Contract (AGENTS.md §4.6)
// 2. Stage 0 AI Factory Config & Path Resolution Contract (.ai-factory/config.yaml)
// 3. Plan Phase Contract (aif-plan -> 6 canonical plan phases per execution mode)
// 4. Implementation Bottom-Up & Mission State Contract (aif-implement -> stages 1-7, wiring gates)
// 5. Verification & Handoff Contract (aif-verify -> aif-gate-result: blockers, affected_files)
// 6. Canary / Mutation Tests (detecting unbound interfaces, unrouted actions, broken migrations)
// 7. Non-Yii3 Guard Discrimination (suppression for Yii 2 and plain ecosystem libraries)

import { mkdtempSync, readFileSync, writeFileSync, rmSync, existsSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
let testsPassed = 0;
let testsFailed = 0;

function assert(condition, message) {
  if (!condition) {
    console.error(`  FAIL: ${message}`);
    testsFailed++;
    throw new Error(message);
  }
  console.log(`  PASS: ${message}`);
  testsPassed++;
}

console.log('=== AI Factory Workflow Contract Test Suite ===\n');

// ---------------------------------------------------------------------------
// 1. Injections Canonical Guard & Structure Contract
// ---------------------------------------------------------------------------
console.log('1. Validating Injections Activation Guards (AGENTS.md §4.6)...');
const manifest = JSON.parse(readFileSync(join(root, 'extension.json'), 'utf8'));
const CANONICAL_GUARD =
  'Guard: activate this block only for a Yii 3 application — at least one `yiisoft/yii-*` package (application/runtime stack, e.g. `yiisoft/yii-runner-http`, `yiisoft/yii-runner-console`, `yiisoft/yii-http`, or `yiisoft/yii-console`; `yiisoft/yii2` excluded) in `composer.json` or `composer.lock`. Yii 2 project (`yiisoft/yii2` present), Yii-ecosystem library (only base `yiisoft/*` packages like `yiisoft/di` or `yiisoft/strings`, without application runtime stack), or non-Yii project: ignore this block and do not apply Yii 3 rules. Unknown project state (neither composer.json nor composer.lock present, contradictory evidence): do not auto-activate — ask the user or report the task blocked (`composer.json` declares intent; `composer.lock` confirms installed versions). Otherwise';

for (const inj of manifest.injections) {
  const injPath = join(root, inj.file);
  const text = readFileSync(injPath, 'utf8').replace(/\r\n/g, '\n');
  const lines = text.split('\n');
  const guardLine = lines.find((l) => l.startsWith('Guard:'));

  assert(guardLine !== undefined, `${inj.file} must have a Guard: line`);
  assert(guardLine.startsWith(CANONICAL_GUARD), `${inj.file} guard must match CANONICAL_GUARD prefix byte-for-byte`);
  assert(text.includes('SKILL.md') || text.includes('`yii3` skill'), `${inj.file} must defer to yii3 skill as SSOT`);
}

// ---------------------------------------------------------------------------
// 2. AI Factory Config Resolution Contract (.ai-factory/config.yaml)
// ---------------------------------------------------------------------------
console.log('\n2. Validating .ai-factory/config.yaml Path Resolution Contract...');

function resolveAifConfig(projectDir) {
  const configPath = join(projectDir, '.ai-factory', 'config.yaml');
  if (!existsSync(configPath)) {
    return {
      plansDir: 'docs/plans',
      architecturePath: null,
      rulesPath: null,
      isAiFactory: false,
    };
  }
  const raw = readFileSync(configPath, 'utf8');
  const plansMatch = raw.match(/plans:\s*([^\n\r#]+)/);
  const archMatch = raw.match(/architecture:\s*([^\n\r#]+)/);
  const rulesMatch = raw.match(/rules_file:\s*([^\n\r#]+)/);

  return {
    plansDir: plansMatch ? plansMatch[1].trim() : '.ai-factory/plans',
    architecturePath: archMatch ? archMatch[1].trim() : '.ai-factory/ARCHITECTURE.md',
    rulesPath: rulesMatch ? rulesMatch[1].trim() : null,
    isAiFactory: true,
  };
}

const tempDir = mkdtempSync(join(tmpdir(), 'aif-workflow-test-'));
try {
  mkdirSync(join(tempDir, '.ai-factory'), { recursive: true });
  writeFileSync(
    join(tempDir, '.ai-factory', 'config.yaml'),
    'paths:\n  plans: custom/plans/dir\n  architecture: custom/ARCH.md\n  rules_file: custom/rules.md\n'
  );
  const resolved = resolveAifConfig(tempDir);
  assert(resolved.isAiFactory === true, 'Detected AI Factory mode from config.yaml');
  assert(resolved.plansDir === 'custom/plans/dir', 'Resolved custom plans directory');
  assert(resolved.architecturePath === 'custom/ARCH.md', 'Resolved custom architecture path');
  assert(resolved.rulesPath === 'custom/rules.md', 'Resolved custom rules path');
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------
// 3. Plan Phase Contract & Anti-Collapsing Invariant (aif-plan)
// ---------------------------------------------------------------------------
console.log('\n3. Validating 6-Phase Plan Contract & Decomposition Intensity...');

const CANONICAL_PHASES = [
  'Phase 1 Migration & Schema',
  'Phase 2 Domain Entity & Repository Interface',
  'Phase 3 Repository Implementation',
  'Phase 4 Use Case Handler & Events',
  'Phase 5 Input DTO & Single-Action Handler',
  'Phase 6 Wiring & Tests',
];

function validatePlanArtifact(planText, { mode = 'Feature' } = {}) {
  const missingPhases = [];
  for (const phase of CANONICAL_PHASES) {
    const num = phase.split(' ')[1];
    const re = new RegExp(`Phase\\s+${num}\\b`, 'i');
    if (!re.test(planText)) {
      missingPhases.push(phase);
    }
  }

  // Anti-collapsing invariant across all feature plans:
  if (/into\s+(?:single-action|action|controller)|folded\s+directly\s+into/i.test(planText)) {
    throw new Error('Plans cannot collapse Phase 4 business logic directly into an Action — actions strictly remain thin HTTP adapters');
  }

  return missingPhases;
}

const mockFullPlan = `
# Plan: User Registration Feature
## Phase 1 Migration & Schema
- [ ] Task 1.1: Create users table migration in migrations/
## Phase 2 Domain Entity & Repository Interface
- [ ] Task 2.1: Domain aggregate User in src/User/Domain/
- [ ] Task 2.2: UserRepositoryInterface in src/User/Domain/
## Phase 3 Repository Implementation
- [ ] Task 3.1: SqlUserRepository in src/User/Infrastructure/
## Phase 4 Use Case Handler & Events
- [ ] Task 4.1: RegisterUserCommand and RegisterUserHandler in src/User/Application/
- [ ] Task 4.2: UserRegisteredEvent in src/User/Application/Event/
## Phase 5 Input DTO & Single-Action Handler
- [ ] Task 5.1: RegisterUserRequest DTO with validator attributes in src/User/Presentation/
- [ ] Task 5.2: RegisterUserAction single-action controller in src/User/Presentation/
## Phase 6 Wiring & Tests
- [ ] Task 6.1: DI binding in config/common/di/user.php
- [ ] Task 6.2: Route registration in config/common/routes.php
- [ ] Task 6.3: Unit & HTTP integration tests in tests/User/
`;

const missingFull = validatePlanArtifact(mockFullPlan);
assert(missingFull.length === 0, 'Full plan contains all 6 canonical phases');

const mockFeaturePlan = `
# Plan: Simple Admin Status Toggle
## Phase 1 Migration & Schema
- [ ] Task 1.1: Add status column migration
## Phase 2 Domain Entity & Repository Interface
- [ ] skipped — pragmatic architecture consumes Status model directly
## Phase 3 Repository Implementation
- [ ] Task 3.1: StatusRepository in src/Setting/
## Phase 4 Use Case Handler & Events
- [ ] Task 4.1: StatusService application service coordinates repository updates
## Phase 5 Input DTO & Single-Action Handler
- [ ] Task 5.1: ToggleStatusRequest DTO with validator rules
- [ ] Task 5.2: ToggleStatusAction delegating to StatusService
## Phase 6 Wiring & Tests
- [ ] Task 6.1: Route and DI wiring
- [ ] Task 6.2: Action test
`;

const missingFeature = validatePlanArtifact(mockFeaturePlan, { mode: 'Feature' });
assert(missingFeature.length === 0, 'Feature plan preserves 6 phases with pragmatic service/repository separation');

// Canary: reject plans collapsing use cases directly into action controllers
const mockInvalidActionPlan = `
## Phase 1 Migration & Schema
- [ ] Task 1.1: migration
## Phase 2 Domain Entity & Repository Interface
- [ ] skipped
## Phase 3 Repository Implementation
- [ ] Task 3.1: repo
## Phase 4 Use Case Handler & Events
- [ ] folded directly into single-action handler
## Phase 5 Input DTO & Single-Action Handler
- [ ] Task 5.1: action
## Phase 6 Wiring & Tests
- [ ] Task 6.1: tests
`;
let invalidActionCaught = false;
try {
  validatePlanArtifact(mockInvalidActionPlan, { mode: 'Feature' });
} catch {
  invalidActionCaught = true;
}
assert(invalidActionCaught, 'Canary rejects collapsing Phase 4 directly into single-action controller');

// ---------------------------------------------------------------------------
// 4. Execution Bottom-Up & Mission State Contract (aif-implement)
// ---------------------------------------------------------------------------
console.log('\n4. Validating Execution Bottom-Up & Mission State Tracker Contract...');

function validateMissionState(transcript) {
  const hasMissionStateHeading = /###\s*Mission State/i.test(transcript);
  const hasMode = /Mode:?\*{0,2}\s*(Patch|Feature|Enterprise)/i.test(transcript);
  const hasArchitecture = /Architecture:?\*{0,2}\s*[^\n\r]+/i.test(transcript);
  const hasStageProgress = /Stage\s*1.*Migration/i.test(transcript) && /Stage\s*6.*Config/i.test(transcript);

  // Semantic check: sequential bottom-up stage progression
  const stageMatches = [...transcript.matchAll(/Stage\s+(\d+)\s+complete:/gi)].map((m) => Number(m[1]));
  const isSequential = stageMatches.length > 0 && stageMatches.every((val, idx) => idx === 0 ? true : val > stageMatches[idx - 1]);

  // Semantic check: all completed stages must verify wiring gate
  const completionLines = transcript.split('\n').filter((l) => /Stage\s+\d+\s+complete:/i.test(l));
  const allGatesPassed = completionLines.length > 0 && completionLines.every((l) => /Wiring gate:\s*pass/i.test(l));

  return hasMissionStateHeading && hasMode && hasArchitecture && hasStageProgress && isSequential && allGatesPassed;
}

const mockTranscript = `
### Mission State
- **Mode:** Feature
- **Architecture:** .ai-factory/ARCHITECTURE.md
- **Guides:** references/http-actions-core.md, references/persistence-db.md
- **Stage Progress:**
  - Stage 1 [Migration & Schema]: pending
  - Stage 2 [Domain Entity & Repository Contract]: pending
  - Stage 3 [Repository Implementation]: pending
  - Stage 4 [Use Case & Domain Events]: pending
  - Stage 5 [Input DTO & Action / Command]: pending
  - Stage 6 [Config Audit & Wiring Gate]: pending
  - Stage 7 [Tests & Quality Gate]: pending

Stage 1 complete: migrations/20261108_users.php | Wiring gate: pass
Stage 2 complete: User.php, UserRepositoryInterface.php | Wiring gate: pass
Stage 3 complete: SqlUserRepository.php | Wiring gate: pass
Stage 4 complete: RegisterUserHandler.php | Wiring gate: pass
Stage 5 complete: RegisterUserRequest.php, RegisterUserAction.php | Wiring gate: pass
Stage 6 complete: config/common/di/user.php, config/common/routes.php | Wiring gate: pass
Stage 7 complete: tests/User/RegisterTest.php | Wiring gate: pass
`;

assert(validateMissionState(mockTranscript), 'Transcript satisfies Mission State Tracker contract');

const mockOutOfOrderTranscript = mockTranscript.replace(
  'Stage 2 complete: User.php',
  'Stage 5 complete: User.php'
);
assert(!validateMissionState(mockOutOfOrderTranscript), 'Canary rejects out-of-order stage progression');

const mockFailedGateTranscript = mockTranscript.replace(
  'Stage 3 complete: SqlUserRepository.php | Wiring gate: pass',
  'Stage 3 complete: SqlUserRepository.php | Wiring gate: fail'
);
assert(!validateMissionState(mockFailedGateTranscript), 'Canary rejects failed wiring gate in mission progress');

// ---------------------------------------------------------------------------
// 5. Verification & Handoff Contract (aif-verify -> aif-gate-result AI Factory 2.x)
// ---------------------------------------------------------------------------
console.log('\n5. Validating Verification Handoff Engine & aif-gate-result (AI Factory 2.x)...');

function simulateAifVerify({ changedFiles, projectFiles, composerPackages, unverifiedApis = [] }) {
  const blockers = [];
  const warnings = [];
  const affected_files = changedFiles.map((c) => c.path);
  let blockerSeq = 1;

  // 1. Interfaces bound in DI
  const interfaces = changedFiles
    .filter((c) => /Interface\.php$/.test(c.path))
    .map((c) => c.path.split('/').pop().replace('.php', ''));

  const diConfigs = projectFiles.filter((f) => /config\/.*\/di\/.*\.php$|config\/.*\/di\.php$/.test(f.path));
  const diContent = diConfigs.map((f) => f.content).join('\n');

  for (const iface of interfaces) {
    if (!new RegExp(`\\b${iface}::class`).test(diContent)) {
      blockers.push({
        id: `verify-di-${String(blockerSeq++).padStart(3, '0')}`,
        severity: 'error',
        file: changedFiles.find((c) => c.path.endsWith(`${iface}.php`))?.path ?? 'config/di.php',
        summary: `Interface "${iface}" is not bound in DI configuration`,
      });
    }
  }

  // 2. Actions mounted in routes
  const actions = changedFiles.filter((c) => /Action\.php$/.test(c.path));
  const routeConfigs = projectFiles.filter((f) => /config\/.*routes.*\.php$/.test(f.path));
  const routeContent = routeConfigs.map((f) => f.content).join('\n');

  for (const act of actions) {
    const actName = act.path.split('/').pop().replace('.php', '');
    if (!new RegExp(`\\b${actName}::class`).test(routeContent)) {
      blockers.push({
        id: `verify-route-${String(blockerSeq++).padStart(3, '0')}`,
        severity: 'error',
        file: act.path,
        summary: `Action "${actName}" has no active route mounted in config/routes.php`,
      });
    }
  }

  // 3. Reversible migrations
  const migrations = changedFiles.filter((c) => /^migrations\/.*\.php$/.test(c.path));
  for (const m of migrations) {
    const downMatch = m.content.match(/function\s+down\s*\([^)]*\)[^{]*\{([\s\S]*?)\}/i);
    if (!downMatch || !/\b(drop|delete|alter)\w*\(/i.test(downMatch[1])) {
      blockers.push({
        id: `verify-migration-${String(blockerSeq++).padStart(3, '0')}`,
        severity: 'error',
        file: m.path,
        summary: `Migration "${m.path}" lacks a reversible down() method`,
      });
    }
  }

  // 4. Packages used in code are declared in composer.json
  const phpFiles = changedFiles.filter((c) => c.path.endsWith('.php'));
  for (const file of phpFiles) {
    if (/Yiisoft\\Validator\\/i.test(file.content) && !composerPackages.includes('yiisoft/validator')) {
      blockers.push({
        id: `verify-pkg-${String(blockerSeq++).padStart(3, '0')}`,
        severity: 'error',
        file: file.path,
        summary: `Package "yiisoft/validator" is used in "${file.path}" but missing from composer.json`,
      });
    }
    if (/Yiisoft\\Mailer\\/i.test(file.content) && !composerPackages.includes('yiisoft/mailer')) {
      blockers.push({
        id: `verify-pkg-${String(blockerSeq++).padStart(3, '0')}`,
        severity: 'error',
        file: file.path,
        summary: `Package "yiisoft/mailer" is used in "${file.path}" but missing from composer.json`,
      });
    }
  }

  // 5. Unverified API symbols (advisory warnings per AGENTS.md §4.7)
  for (const api of unverifiedApis) {
    warnings.push({
      id: `verify-unverified-api-${String(blockerSeq++).padStart(3, '0')}`,
      severity: 'warning',
      summary: `API symbol "${api}" is not verified against installed vendor sources`,
    });
  }

  const hasBlockers = blockers.length > 0;
  const hasWarnings = warnings.length > 0;
  const status = hasBlockers ? 'fail' : (hasWarnings ? 'warn' : 'pass');

  const ALLOWED_COMMANDS = ['/aif-fix', '/aif-rules', '/aif-architecture', '/aif-roadmap', '/aif-commit', null];

  const suggested_next = hasBlockers
    ? { command: '/aif-fix', reason: 'Blocking implementation violations remain.' }
    : { command: '/aif-commit', reason: hasWarnings ? 'Verification passed with non-blocking advisory warnings.' : 'All architectural gates and checks passed.' };

  assert(ALLOWED_COMMANDS.includes(suggested_next.command), `suggested_next command "${suggested_next.command}" must be in allowlist`);

  return {
    schema_version: 1,
    gate: 'verify',
    status,
    blocking: hasBlockers,
    blockers,
    affected_files,
    suggested_next,
  };
}

// 5a. Clean feature pass
const cleanFeature = simulateAifVerify({
  changedFiles: [
    {
      path: 'src/Comment/CommentRepositoryInterface.php',
      content: '<?php\ndeclare(strict_types=1);\nnamespace App\\Comment;\ninterface CommentRepositoryInterface {}',
    },
    {
      path: 'src/Comment/CreateCommentAction.php',
      content: '<?php\ndeclare(strict_types=1);\nnamespace App\\Comment;\nfinal class CreateCommentAction {}',
    },
    {
      path: 'migrations/20261108_000001_comments.php',
      content: '<?php\nclass M20261108Comments { public function down() { $this->dropTable("comments"); } }',
    },
  ],
  projectFiles: [
    {
      path: 'config/common/di/comment.php',
      content: 'return [CommentRepositoryInterface::class => SqlCommentRepository::class];',
    },
    {
      path: 'config/common/routes.php',
      content: "return [new \\Yiisoft\\Router\\Route\\Post('/comments', CreateCommentAction::class)];",
    },
  ],
  composerPackages: ['yiisoft/yii-runner-http', 'yiisoft/di', 'yiisoft/router', 'yiisoft/db-migration'],
});

assert(cleanFeature.schema_version === 1, 'Clean feature has schema_version: 1');
assert(cleanFeature.gate === 'verify', 'Clean feature has gate: "verify"');
assert(cleanFeature.status === 'pass', 'Clean feature passes verify gate');
assert(cleanFeature.blocking === false, 'Clean feature has blocking: false');
assert(cleanFeature.blockers.length === 0, 'Clean feature has 0 blockers');
assert(cleanFeature.affected_files.length === 3, 'Clean feature records affected_files');
assert(cleanFeature.suggested_next.command === '/aif-commit', 'Clean feature suggests /aif-commit');

// 5b. Canary: Unbound interface caught
const canaryUnbound = simulateAifVerify({
  changedFiles: [
    {
      path: 'src/Order/OrderRepositoryInterface.php',
      content: '<?php\ninterface OrderRepositoryInterface {}',
    },
  ],
  projectFiles: [{ path: 'config/common/di/order.php', content: 'return [];' }],
  composerPackages: ['yiisoft/yii-runner-http'],
});
assert(canaryUnbound.status === 'fail', 'Canary catches unbound interface');
assert(canaryUnbound.blocking === true, 'Canary marks blocking: true');
assert(
  canaryUnbound.blockers.some((b) => b.summary.includes('OrderRepositoryInterface') && b.severity === 'error'),
  'Blocker structured object explicitly names OrderRepositoryInterface with error severity'
);
assert(canaryUnbound.suggested_next.command === '/aif-fix', 'Canary suggested_next command is /aif-fix');

// 5c. Canary: Unrouted action caught
const canaryUnrouted = simulateAifVerify({
  changedFiles: [
    {
      path: 'src/Order/CancelOrderAction.php',
      content: '<?php\nfinal class CancelOrderAction {}',
    },
  ],
  projectFiles: [{ path: 'config/common/routes.php', content: 'return [];' }],
  composerPackages: ['yiisoft/yii-runner-http'],
});
assert(canaryUnrouted.status === 'fail', 'Canary catches unrouted action');
assert(canaryUnrouted.blockers.some((b) => b.summary.includes('CancelOrderAction')), 'Blocker explicitly names CancelOrderAction');

// 5d. Canary: Irreversible migration caught
const canaryMigration = simulateAifVerify({
  changedFiles: [
    {
      path: 'migrations/20261108_orders.php',
      content: '<?php\nclass M { public function down() { /* empty */ } }',
    },
  ],
  projectFiles: [],
  composerPackages: ['yiisoft/yii-runner-http'],
});
assert(canaryMigration.status === 'fail', 'Canary catches irreversible migration');
assert(canaryMigration.blockers.some((b) => b.summary.includes('down()')), 'Blocker explicitly notes missing reversible down()');

// 5e. Canary: Undeclared package caught
const canaryUndeclared = simulateAifVerify({
  changedFiles: [
    {
      path: 'src/Notification/EmailService.php',
      content: '<?php\nuse Yiisoft\\Mailer\\MailerInterface;\nclass EmailService {}',
    },
  ],
  projectFiles: [],
  composerPackages: ['yiisoft/yii-runner-http'],
});
assert(canaryUndeclared.status === 'fail', 'Canary catches undeclared package');
assert(canaryUndeclared.blockers.some((b) => b.summary.includes('yiisoft/mailer')), 'Blocker explicitly names undeclared package');

// 5f. Non-blocking warning scenario (warn status)
const canaryWarn = simulateAifVerify({
  changedFiles: [
    {
      path: 'src/Comment/CommentRepositoryInterface.php',
      content: '<?php\ndeclare(strict_types=1);\nnamespace App\\Comment;\ninterface CommentRepositoryInterface {}',
    },
  ],
  projectFiles: [
    {
      path: 'config/common/di/comment.php',
      content: 'return [CommentRepositoryInterface::class => SqlCommentRepository::class];',
    },
  ],
  composerPackages: ['yiisoft/yii-runner-http', 'yiisoft/di'],
  unverifiedApis: ['Yiisoft\\Widget\\SpecialWidget::run()'],
});
assert(canaryWarn.status === 'warn', 'Unverified API returns status "warn"');
assert(canaryWarn.blocking === false, 'Advisory warning marks blocking: false');
assert(canaryWarn.blockers.length === 0, 'Advisory warnings do not enter blocking blockers list');
assert(canaryWarn.suggested_next.command === '/aif-commit', 'Advisory warning suggested_next is /aif-commit');

// 5g. Full Closed-Loop Remediation Contract Test (verify -> aif-fix -> verify -> PASS)
const initialProjectFiles = [
  { path: 'config/common/di/order.php', content: 'return [];' },
  { path: 'config/common/routes.php', content: "return [new \\Yiisoft\\Router\\Route\\Post('/order/cancel', CancelOrderAction::class)];" },
];
const initialChangedFiles = [
  { path: 'src/Order/OrderRepositoryInterface.php', content: '<?php\ninterface OrderRepositoryInterface {}' },
  { path: 'src/Order/CancelOrderAction.php', content: '<?php\nfinal class CancelOrderAction {}' },
];

// Loop step 1: initial verify fails with blocker
const initialVerification = simulateAifVerify({
  changedFiles: initialChangedFiles,
  projectFiles: initialProjectFiles,
  composerPackages: ['yiisoft/yii-runner-http', 'yiisoft/di', 'yiisoft/router'],
});
assert(initialVerification.status === 'fail', 'E2E loop: Initial verification fails with blocker');
assert(initialVerification.blocking === true, 'E2E loop: Initial verification is blocking');
assert(initialVerification.blockers.length === 1, 'E2E loop: Exactly one blocker found');
assert(initialVerification.blockers[0].file === 'src/Order/OrderRepositoryInterface.php', 'E2E loop: Blocker identifies exact defect file');
assert(initialVerification.suggested_next.command === '/aif-fix', 'E2E loop: Hands off cleanly to /aif-fix');

// Loop step 2: simulate aif-fix remediating the defect strictly for the blocker file
const remediatedProjectFiles = [
  { path: 'config/common/di/order.php', content: 'return [OrderRepositoryInterface::class => SqlOrderRepository::class];' },
  { path: 'config/common/routes.php', content: "return [new \\Yiisoft\\Router\\Route\\Post('/order/cancel', CancelOrderAction::class)];" },
];

// Loop step 3: re-verify the remediated codebase
const reVerification = simulateAifVerify({
  changedFiles: initialChangedFiles,
  projectFiles: remediatedProjectFiles,
  composerPackages: ['yiisoft/yii-runner-http', 'yiisoft/di', 'yiisoft/router'],
});
assert(reVerification.status === 'pass', 'E2E loop: Re-verification passes cleanly after fix');
assert(reVerification.blocking === false, 'E2E loop: Re-verification is non-blocking');
assert(reVerification.blockers.length === 0, 'E2E loop: Blockers are completely resolved');
assert(reVerification.suggested_next.command === '/aif-commit', 'E2E loop: Final handoff proceeds to /aif-commit');

// ---------------------------------------------------------------------------
// 6. Guard Discrimination on Non-Yii3 Project
// ---------------------------------------------------------------------------
console.log('\n6. Validating Activation Guard Discrimination...');

function shouldActivateYii3Skill(composerJsonText) {
  const json = JSON.parse(composerJsonText);
  const allReqs = { ...(json.require ?? {}), ...(json['require-dev'] ?? {}) };
  const keys = Object.keys(allReqs);

  // Yii 2 explicit exclusion
  if (keys.includes('yiisoft/yii2') || keys.some((k) => k.startsWith('yiisoft/yii2-'))) {
    return false;
  }

  // Must have at least one yiisoft/yii-* application/runtime stack package
  const runtimePackages = [
    'yiisoft/yii-runner',
    'yiisoft/yii-runner-http',
    'yiisoft/yii-runner-console',
    'yiisoft/yii-runner-roadrunner',
    'yiisoft/yii-runner-frankenphp',
    'yiisoft/yii-http',
    'yiisoft/yii-console',
  ];
  return keys.some((k) => runtimePackages.includes(k) || k.startsWith('yiisoft/yii-runner'));
}

assert(
  shouldActivateYii3Skill(JSON.stringify({ require: { 'yiisoft/yii-runner-http': '^2.0' } })) === true,
  'Activates for yiisoft/yii-runner-http'
);
assert(
  shouldActivateYii3Skill(JSON.stringify({ require: { 'yiisoft/yii-console': '^2.0' } })) === true,
  'Activates for yiisoft/yii-console'
);
assert(
  shouldActivateYii3Skill(JSON.stringify({ require: { 'yiisoft/yii2': '^2.0.45' } })) === false,
  'Suppresses for Yii 2 project'
);
assert(
  shouldActivateYii3Skill(JSON.stringify({ require: { 'yiisoft/di': '^1.3', 'yiisoft/strings': '^2.0' } })) === false,
  'Suppresses for plain Yiisoft ecosystem library'
);
assert(
  shouldActivateYii3Skill(JSON.stringify({ require: { 'yiisoft/yii-event': '^1.0', 'yiisoft/di': '^1.3' } })) === false,
  'Suppresses for isolated library with yiisoft/yii-event without runtime stack'
);
assert(
  shouldActivateYii3Skill(JSON.stringify({ require: { 'laravel/framework': '^11.0' } })) === false,
  'Suppresses for non-Yii project'
);

// ---------------------------------------------------------------------------
// 7. Durable Plan Execution State Contract (### Execution State)
// ---------------------------------------------------------------------------
console.log('\n7. Validating Durable Plan Execution State (### Execution State)...');

function validateExecutionStateBlock(planText) {
  const hasHeading = /###\s*Execution State/i.test(planText);
  const hasStage = /Stage:?\*{0,2}\s*[^\n\r]+/i.test(planText);
  const statusMatch = planText.match(/Status:?\*{0,2}\s*(IN PROGRESS|COMPLETE|BLOCKED)/i);
  const hasArtifacts = /Artifacts:?\*{0,2}\s*[\s\S]*?-\s*`[^`]+`/i.test(planText);
  const hasWiring = /Wiring Gates:?\*{0,2}\s*[\s\S]*?DI binding:?\*{0,2}\s*(PASS|PENDING|N\/A)/i.test(planText);
  const hasVerification = /Verification:?\*{0,2}\s*[\s\S]*?Syntax.*?:?\*{0,2}\s*(PASS|FAIL|NOT RUN)/i.test(planText);
  const hasNextStage = /Next Stage:?\*{0,2}\s*[^\n\r]+/i.test(planText);

  if (!hasHeading || !hasStage || !statusMatch || !hasArtifacts || !hasWiring || !hasVerification || !hasNextStage) {
    return false;
  }

  const status = statusMatch[1].toUpperCase();

  // Semantic check: COMPLETE status requires all wiring gates to be PASS or N/A
  if (status === 'COMPLETE') {
    const wiringBlock = planText.match(/Wiring Gates:?[\s\S]*?(?=Verification|$)/i)?.[0] ?? '';
    if (/PENDING|FAIL/i.test(wiringBlock)) {
      return false;
    }
    const verifBlock = planText.match(/Verification:?[\s\S]*?(?=Open Issues|$)/i)?.[0] ?? '';
    if (/FAIL/i.test(verifBlock)) {
      return false;
    }
  }

  // Semantic check: BLOCKED status requires an explicit explanation in Open Issues
  if (status === 'BLOCKED') {
    const issuesMatch = planText.match(/Open Issues:?\*{0,2}\s*([^\n\r]+)/i);
    if (!issuesMatch || /none/i.test(issuesMatch[1])) {
      return false;
    }
  }

  return true;
}

const mockPlanWithExecutionState = `
# Plan: User Registration Feature
## Phase 1 Migration & Schema
- [x] Task 1.1: Create users table migration

### Execution State
- **Stage:** Stage 3 — Repository Implementation
- **Status:** IN PROGRESS
- **Artifacts:**
  - \`src/Infrastructure/Repository/UserRepository.php\` (Repository Implementation)
- **Wiring Gates:**
  - DI binding: PASS
  - Routes / CLI: PENDING
  - Events / Migrations: PASS
- **Verification:**
  - Syntax / Project Checks: PASS
  - Unit / HTTP Tests: NOT RUN
- **Open Issues:** None
- **Next Stage:** Stage 4 — Use Case Handler
`;

assert(validateExecutionStateBlock(mockPlanWithExecutionState), 'Validates complete ### Execution State block in plan');

// Semantic canary: COMPLETE status rejected if wiring gates are still PENDING
const mockPrematureCompletePlan = mockPlanWithExecutionState.replace(
  '- **Status:** IN PROGRESS',
  '- **Status:** COMPLETE'
);
assert(!validateExecutionStateBlock(mockPrematureCompletePlan), 'Canary rejects COMPLETE status when wiring gates are PENDING');

// Semantic canary: BLOCKED status rejected if Open Issues is None
const mockBadBlockedPlan = mockPlanWithExecutionState.replace(
  '- **Status:** IN PROGRESS',
  '- **Status:** BLOCKED'
);
assert(!validateExecutionStateBlock(mockBadBlockedPlan), 'Canary rejects BLOCKED status when Open Issues is None');

// ---------------------------------------------------------------------------
// 8. Canonical 5-State Verification Vocabulary
// ---------------------------------------------------------------------------
console.log('\n8. Validating Canonical 5-State Verification Vocabulary...');

const CANONICAL_STATUSES = new Set(['pass', 'fail', 'not run', 'blocked', 'n/a']);

function parseVerificationStatuses(reportText) {
  const testsMatch = reportText.match(/tests:\s*([^\n\r]+)/i);
  const psalmMatch = reportText.match(/static analysis[^:]*:\s*([^\n\r]+)/i);
  const results = [];

  for (const match of [testsMatch, psalmMatch]) {
    if (!match) continue;
    const rawStatus = match[1].trim().toLowerCase();
    const baseStatus = rawStatus.split(' ')[0] === 'not' ? 'not run' : rawStatus.split(' ')[0].replace(/\(.*?\)/, '').trim();
    results.push(baseStatus);
  }
  return results;
}

const mockReport = `
Mode: Full
Decomposition: Full
Architecture: .ai-factory/ARCHITECTURE.md
fixes applied: none
tests: not run (offline environment)
static analysis (Psalm/PHPStan, Rector): pass
packages added: none
config files changed: config/common/di/user.php
production readiness gate: pass
`;

const parsed = parseVerificationStatuses(mockReport);
assert(parsed.length === 2, 'Parsed both verification status lines');
for (const status of parsed) {
  assert(CANONICAL_STATUSES.has(status), `Status "${status}" is in canonical 5-state vocabulary`);
}

// ---------------------------------------------------------------------------
// 9. Adaptive Runtime Smoke Target Resolution
// ---------------------------------------------------------------------------
console.log('\n9. Validating Adaptive Runtime Smoke Target Resolution...');

function resolveSmokeTargets(composerPackages) {
  const targets = [];
  if (composerPackages.includes('yiisoft/yii-console')) {
    targets.push('console');
  }
  if (composerPackages.includes('yiisoft/yii-runner-roadrunner')) {
    targets.push('roadrunner');
  } else if (composerPackages.includes('yiisoft/yii-runner-frankenphp')) {
    targets.push('frankenphp');
  } else if (composerPackages.includes('yiisoft/yii-runner-http')) {
    targets.push('sapi');
  }
  return targets;
}

assert(
  JSON.stringify(resolveSmokeTargets(['yiisoft/yii-runner-http', 'yiisoft/yii-console'])) ===
    JSON.stringify(['console', 'sapi']),
  'Resolves console + sapi smoke targets'
);
assert(
  JSON.stringify(resolveSmokeTargets(['yiisoft/yii-runner-roadrunner', 'yiisoft/yii-console'])) ===
    JSON.stringify(['console', 'roadrunner']),
  'Resolves console + roadrunner smoke targets'
);
assert(
  JSON.stringify(resolveSmokeTargets(['yiisoft/yii-runner-frankenphp'])) ===
    JSON.stringify(['frankenphp']),
  'Resolves frankenphp smoke target'
);

// ---------------------------------------------------------------------------
// 10. Verification Code-Read-Only & Progressive Disclosure Contract
// ---------------------------------------------------------------------------
console.log('\n10. Validating Verification Code-Read-Only & Progressive Disclosure...');

const verifyInjectionText = readFileSync(join(root, 'injections', 'verify.md'), 'utf8');
assert(
  /Code-Read-Only/i.test(verifyInjectionText),
  'injections/verify.md explicitly enforces Code-Read-Only boundary'
);
assert(
  /aif-fix/i.test(verifyInjectionText),
  'injections/verify.md delegates defect resolution to aif-fix'
);

const skillMdText = readFileSync(join(root, 'skills', 'yii3', 'SKILL.md'), 'utf8');
assert(
  skillMdText.includes('references/aif-adapter.md'),
  'SKILL.md links to references/aif-adapter.md for progressive disclosure'
);

const aifAdapterText = readFileSync(join(root, 'skills', 'yii3', 'references', 'aif-adapter.md'), 'utf8');
assert(
  /### Execution State/i.test(aifAdapterText),
  'references/aif-adapter.md documents the durable ### Execution State format'
);
assert(
  /Code-Read-Only/i.test(aifAdapterText),
  'references/aif-adapter.md details the aif-verify Code-Read-Only invariant'
);

console.log(`\nAll AI Factory Workflow contract tests passed! (${testsPassed} passed, ${testsFailed} failed)\n`);
