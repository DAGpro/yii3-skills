#!/usr/bin/env node
// AI Factory Workflow End-to-End Contract Test (Node >= 18, ESM, node:* stdlib only).
// Validates the integration between yii3-skills and AI Factory workflows:
// 1. Injections Canonical Guard & Structure Contract (AGENTS.md §4.6)
// 2. Stage 0 AI Factory Config & Path Resolution Contract (.ai-factory/config.yaml)
// 3. Plan Phase Contract (aif-plan -> 6 canonical plan phases, collapsed decomposition)
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

console.log('=== AI Factory Workflow End-to-End Contract Test ===\n');

// ---------------------------------------------------------------------------
// 1. Injections Canonical Guard & Structure Contract
// ---------------------------------------------------------------------------
console.log('1. Validating Injections Activation Guards (AGENTS.md §4.6)...');
const manifest = JSON.parse(readFileSync(join(root, 'extension.json'), 'utf8'));
const CANONICAL_GUARD =
  'Guard: activate this block only for a Yii 3 application — at least one `yiisoft/yii-*` package (app/runtime stack, e.g. `yiisoft/yii-runner-http` or `yiisoft/yii-console`; `yiisoft/yii2` excluded) in `composer.json` or `composer.lock`. Yii 2 project (`yiisoft/yii2` present), Yii-ecosystem library (only base `yiisoft/*` packages like `yiisoft/di` or `yiisoft/strings`, no `yiisoft/yii-*`), or non-Yii project: ignore this block and do not apply Yii 3 rules. Unknown project state (missing `composer.lock`, contradictory evidence): do not auto-activate — ask the user or report the task blocked. Otherwise';

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
// 3. Plan Phase Contract (aif-plan -> 6 Canonical Plan Phases)
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

function validatePlanArtifact(planText, { allowCollapsed = false } = {}) {
  const missingPhases = [];
  for (const phase of CANONICAL_PHASES) {
    const num = phase.split(' ')[1];
    const re = new RegExp(`Phase\\s+${num}\\b`, 'i');
    if (!re.test(planText)) {
      missingPhases.push(phase);
    }
  }

  if (allowCollapsed) {
    assert(
      /collapsed\s+—/i.test(planText),
      'Standard-tier collapsed plan must explicitly mark folded artifacts `collapsed — <reason>`'
    );
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

const mockStandardPlan = `
# Plan: Simple Admin Status Toggle
## Phase 1 Migration & Schema
- [ ] Task 1.1: Add status column migration
## Phase 2 Domain Entity & Repository Interface
- [ ] collapsed — pass-through status toggle without domain invariants
## Phase 3 Repository Implementation
- [ ] Task 3.1: StatusRepository in src/Setting/
## Phase 4 Use Case Handler & Events
- [ ] collapsed — folded directly into single-action handler
## Phase 5 Input DTO & Single-Action Handler
- [ ] Task 5.1: ToggleStatusRequest DTO with validator rules
- [ ] Task 5.2: ToggleStatusAction
## Phase 6 Wiring & Tests
- [ ] Task 6.1: Route and DI wiring
- [ ] Task 6.2: Action test
`;

const missingStandard = validatePlanArtifact(mockStandardPlan, { allowCollapsed: true });
assert(missingStandard.length === 0, 'Standard plan preserves 6 phases with collapsed markers');

// ---------------------------------------------------------------------------
// 4. Execution Bottom-Up & Mission State Contract (aif-implement)
// ---------------------------------------------------------------------------
console.log('\n4. Validating Execution Bottom-Up & Mission State Tracker Contract...');

function validateMissionState(transcript) {
  const hasMissionStateHeading = /###\s*Mission State/i.test(transcript);
  const hasMode = /Mode:?\*{0,2}\s*(Light|Full)/i.test(transcript);
  const hasDecomposition = /Decomposition:?\*{0,2}\s*(Lightweight|Standard|Full)/i.test(transcript);
  const hasArchitecture = /Architecture:?\*{0,2}\s*[^\n\r]+/i.test(transcript);
  const hasStageProgress = /Stage\s*1.*Migration/i.test(transcript) && /Stage\s*6.*Config/i.test(transcript);

  return hasMissionStateHeading && hasMode && hasDecomposition && hasArchitecture && hasStageProgress;
}

const mockTranscript = `
### Mission State
- **Mode:** Full
- **Decomposition:** Full
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

// ---------------------------------------------------------------------------
// 5. Verification & Handoff Contract (aif-verify -> aif-gate-result)
// ---------------------------------------------------------------------------
console.log('\n5. Validating Verification Handoff Engine & aif-gate-result...');

function simulateAifVerify({ changedFiles, projectFiles, composerPackages }) {
  const blockers = [];
  const affected_files = changedFiles.map((c) => c.path);

  // 1. Interfaces bound in DI
  const interfaces = changedFiles
    .filter((c) => /Interface\.php$/.test(c.path))
    .map((c) => c.path.split('/').pop().replace('.php', ''));

  const diConfigs = projectFiles.filter((f) => /config\/.*\/di\/.*\.php$|config\/.*\/di\.php$/.test(f.path));
  const diContent = diConfigs.map((f) => f.content).join('\n');

  for (const iface of interfaces) {
    if (!new RegExp(`\\b${iface}::class`).test(diContent)) {
      blockers.push(`Interface "${iface}" is not bound in DI configuration`);
    }
  }

  // 2. Actions mounted in routes
  const actions = changedFiles.filter((c) => /Action\.php$/.test(c.path));
  const routeConfigs = projectFiles.filter((f) => /config\/.*routes.*\.php$/.test(f.path));
  const routeContent = routeConfigs.map((f) => f.content).join('\n');

  for (const act of actions) {
    const actName = act.path.split('/').pop().replace('.php', '');
    if (!new RegExp(`\\b${actName}::class`).test(routeContent)) {
      blockers.push(`Action "${actName}" has no active route mounted in config/routes.php`);
    }
  }

  // 3. Reversible migrations
  const migrations = changedFiles.filter((c) => /^migrations\/.*\.php$/.test(c.path));
  for (const m of migrations) {
    const downMatch = m.content.match(/function\s+down\s*\([^)]*\)[^{]*\{([\s\S]*?)\}/i);
    if (!downMatch || !/\b(drop|delete|alter)\w*\(/i.test(downMatch[1])) {
      blockers.push(`Migration "${m.path}" lacks a reversible down() method`);
    }
  }

  // 4. Packages used in code are declared in composer.json
  const phpFiles = changedFiles.filter((c) => c.path.endsWith('.php'));
  for (const file of phpFiles) {
    if (/Yiisoft\\Validator\\/i.test(file.content) && !composerPackages.includes('yiisoft/validator')) {
      blockers.push(`Package "yiisoft/validator" is used in "${file.path}" but missing from composer.json`);
    }
    if (/Yiisoft\\Mailer\\/i.test(file.content) && !composerPackages.includes('yiisoft/mailer')) {
      blockers.push(`Package "yiisoft/mailer" is used in "${file.path}" but missing from composer.json`);
    }
  }

  return {
    status: blockers.length === 0 ? 'pass' : 'fail',
    blockers,
    affected_files,
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

assert(cleanFeature.status === 'pass', 'Clean feature passes verify gate');
assert(cleanFeature.blockers.length === 0, 'Clean feature has 0 blockers');
assert(cleanFeature.affected_files.length === 3, 'Clean feature records affected_files');

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
assert(
  canaryUnbound.blockers.some((b) => b.includes('OrderRepositoryInterface')),
  'Blocker explicitly names OrderRepositoryInterface'
);

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
assert(canaryUnrouted.blockers.some((b) => b.includes('CancelOrderAction')), 'Blocker explicitly names CancelOrderAction');

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
assert(canaryMigration.blockers.some((b) => b.includes('down()')), 'Blocker explicitly notes missing reversible down()');

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
assert(canaryUndeclared.blockers.some((b) => b.includes('yiisoft/mailer')), 'Blocker explicitly names undeclared package');

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

  // Must have at least one yiisoft/yii-* app/runtime package
  return keys.some((k) => k.startsWith('yiisoft/yii-'));
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
  shouldActivateYii3Skill(JSON.stringify({ require: { 'laravel/framework': '^11.0' } })) === false,
  'Suppresses for non-Yii project'
);

console.log(`\nAll AI Factory Workflow contract tests passed! (${testsPassed} passed, ${testsFailed} failed)\n`);
