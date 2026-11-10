#!/usr/bin/env node
// Validates the checks themselves: the positive sample must pass all required checks,
// the negative sample must fail every id listed in scenario.json -> negativeMustFail.
import { mkdtempSync, readFileSync, writeFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { copyDir, listScenarios, loadScenario, runChecks, requiredFailed, extractTelemetry, normalizeTokens, normalizeCost } from './core.mjs';
import { changedFiles, validateAifGateResult, ensurePrewarmedVendor, validateComposerJson, validateComposerLock } from '../lib/checks.mjs';
import { runRuntimeEvaluation } from '../lib/runtime.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const runtimeFlag = process.argv.includes('--runtime');
let bad = 0;

// Validate telemetry extraction
try {
  const t1 = extractTelemetry({ extra: { tokens: '1500', cost: '$0.0045' } });
  if (t1.tokens?.total !== 1500 || t1.cost !== 0.0045) throw new Error(`t1 mismatch: ${JSON.stringify(t1)}`);

  const t2 = extractTelemetry({ extra: { tokens: '{"prompt":1200,"completion":300}' } });
  if (t2.tokens?.prompt !== 1200 || t2.tokens?.completion !== 300 || t2.tokens?.total !== 1500) {
    throw new Error(`t2 mismatch: ${JSON.stringify(t2)}`);
  }

  // 1. Partial tokens: prompt only or completion only should not fake total
  const partPrompt = normalizeTokens({ prompt: 500 });
  if (!partPrompt || partPrompt.prompt !== 500 || partPrompt.total !== undefined) {
    throw new Error(`partPrompt mismatch: ${JSON.stringify(partPrompt)}`);
  }
  const partComp = normalizeTokens({ completion: 250 });
  if (!partComp || partComp.completion !== 250 || partComp.total !== undefined) {
    throw new Error(`partComp mismatch: ${JSON.stringify(partComp)}`);
  }

  const transcript = 'Result summary: total_tokens: 2500\nCost: $0.0125\nCompleted successfully.';
  const t3 = extractTelemetry({ transcript });
  if (t3.tokens?.total !== 2500 || t3.cost !== 0.0125) throw new Error(`t3 mismatch: ${JSON.stringify(t3)}`);

  // 2. Multi-file telemetry: tokens in tokens.json, cost in usage.json (cost must not be dropped)
  const tmpTelemDir = mkdtempSync(join(tmpdir(), 'telem-test-'));
  writeFileSync(join(tmpTelemDir, 'tokens.json'), JSON.stringify({ prompt: 800, completion: 200 }));
  writeFileSync(join(tmpTelemDir, 'usage.json'), JSON.stringify({ cost: 0.0035 }));
  const t4 = extractTelemetry({ dir: tmpTelemDir });
  if (t4.tokens?.total !== 1000 || t4.cost !== 0.0035) throw new Error(`t4 multi-file mismatch: ${JSON.stringify(t4)}`);

  // 3. Multi-block transcript usage aggregation across tool calls
  const multiTranscript = `
    Step 1: {"usage": {"prompt_tokens": 100, "completion_tokens": 50, "cost": 0.001}}
    Step 2: {"usage": {"prompt_tokens": 200, "completion_tokens": 75, "cost": 0.002}}
  `;
  const t5 = extractTelemetry({ transcript: multiTranscript });
  if (t5.tokens?.prompt !== 300 || t5.tokens?.completion !== 125 || t5.tokens?.total !== 425 || t5.cost !== 0.003) {
    throw new Error(`t5 multi-block transcript mismatch: ${JSON.stringify(t5)}`);
  }

  // 4. Multi-step text regex telemetry aggregation
  const regexTranscript = `
    Step 1: prompt_tokens: 150 completion_tokens: 50
    Step 2: prompt_tokens: 250 completion_tokens: 100
    Step 1 cost: $0.0012
    Step 2 cost: $0.0018
  `;
  const t6 = extractTelemetry({ transcript: regexTranscript });
  if (t6.tokens?.prompt !== 400 || t6.tokens?.completion !== 150 || t6.tokens?.total !== 550 || t6.cost !== 0.003) {
    throw new Error(`t6 regex transcript mismatch: ${JSON.stringify(t6)}`);
  }

  // 5. Explicit total_cost takes precedence over per-step cost lines
  const totalCostTranscript = 'Step 1 cost: $0.001\nTotal Cost: $0.0075';
  const t7 = extractTelemetry({ transcript: totalCostTranscript });
  if (t7.cost !== 0.0075) {
    throw new Error(`t7 explicit total_cost mismatch: ${JSON.stringify(t7)}`);
  }

  // 6. Incomplete component blocks: prompt-only second block should not fake total or retain first block's total
  const partialMultiTranscript = `
    Step 1: {"usage": {"prompt_tokens": 100, "completion_tokens": 50}}
    Step 2: {"usage": {"prompt_tokens": 200}}
  `;
  const t8 = extractTelemetry({ transcript: partialMultiTranscript });
  if (t8.tokens?.prompt !== 300 || t8.tokens?.completion !== 50 || t8.tokens?.total !== undefined) {
    throw new Error(`t8 partial multi-block mismatch: ${JSON.stringify(t8)}`);
  }

  // 7. Finite numbers: Infinity must be rejected
  if (normalizeTokens(Infinity) !== null) throw new Error('normalizeTokens accepted Infinity');
  if (normalizeTokens({ prompt: Infinity }) !== null) throw new Error('normalizeTokens accepted prompt: Infinity');
  if (normalizeCost(Infinity) !== null) throw new Error('normalizeCost accepted Infinity');
} catch (e) {
  console.error(`FAIL telemetry-validation: ${e.message}`);
  bad++;
}

// Validate vendor cache lock verification
try {
  const tmpVendorDir = mkdtempSync(join(tmpdir(), 'vendor-test-'));
  const candidateVendor = join(tmpVendorDir, 'cache', 'vendor');
  const cacheLock = join(tmpVendorDir, 'cache', 'composer.lock');
  mkdirSync(candidateVendor, { recursive: true });
  writeFileSync(join(candidateVendor, 'autoload.php'), '<?php // autoloader\n');

  const workWithLock = mkdtempSync(join(tmpdir(), 'work-lock-test-'));
  const workLock = join(workWithLock, 'composer.lock');
  writeFileSync(workLock, '{"packages": [{"name": "yiisoft/di"}]}');

  process.env.EVAL_PREWARMED_VENDOR = candidateVendor;

  // Case A: Missing sidecar composer.lock -> lockMissing: true, vendorPresent: false
  const resA = ensurePrewarmedVendor(workWithLock);
  if (resA.vendorPresent !== false || resA.lockMissing !== true) {
    throw new Error(`case A (missing lock) failed: ${JSON.stringify(resA)}`);
  }

  // Case B: Mismatched sidecar composer.lock -> lockMismatch: true, vendorPresent: false
  writeFileSync(cacheLock, '{"packages": [{"name": "yiisoft/router"}]}');
  const resB = ensurePrewarmedVendor(workWithLock);
  if (resB.vendorPresent !== false || resB.lockMismatch !== true) {
    throw new Error(`case B (mismatched lock) failed: ${JSON.stringify(resB)}`);
  }

  // Case C: Matching sidecar composer.lock -> vendorPresent: true
  writeFileSync(cacheLock, '{"packages": [{"name": "yiisoft/di"}]}');
  const resC = ensurePrewarmedVendor(workWithLock);
  if (resC.vendorPresent !== true) {
    throw new Error(`case C (matching lock) failed: ${JSON.stringify(resC)}`);
  }

  // Case D: Missing lock with EVAL_VENDOR_IGNORE_LOCK=1 -> attached despite missing sidecar lock
  rmSync(join(workWithLock, 'vendor'), { recursive: true, force: true });
  rmSync(cacheLock);
  process.env.EVAL_VENDOR_IGNORE_LOCK = '1';
  const resD = ensurePrewarmedVendor(workWithLock);
  if (resD.vendorPresent !== true) {
    throw new Error(`case D (ignore lock flag) failed: ${JSON.stringify(resD)}`);
  }
  delete process.env.EVAL_VENDOR_IGNORE_LOCK;

  // Case E: Work dir has composer.json but missing composer.lock -> lockMissing: true, vendorPresent: false
  const workNoLock = mkdtempSync(join(tmpdir(), 'work-no-lock-test-'));
  writeFileSync(join(workNoLock, 'composer.json'), '{"require": {"yiisoft/di": "^1.0"}}');
  const resE = ensurePrewarmedVendor(workNoLock);
  if (resE.vendorPresent !== false || resE.lockMissing !== true) {
    throw new Error(`case E (workDir has composer.json without lock) failed: ${JSON.stringify(resE)}`);
  }

  // Case F: Work dir has composer.json without lock, but EVAL_VENDOR_IGNORE_LOCK=1 -> attached
  process.env.EVAL_VENDOR_IGNORE_LOCK = '1';
  const resF = ensurePrewarmedVendor(workNoLock);
  if (resF.vendorPresent !== true) {
    throw new Error(`case F (workDir without lock but ignore lock flag) failed: ${JSON.stringify(resF)}`);
  }
  delete process.env.EVAL_VENDOR_IGNORE_LOCK;
  delete process.env.EVAL_PREWARMED_VENDOR;
} catch (e) {
  console.error(`FAIL vendor-cache-lock-validation: ${e.message}`);
  bad++;
}

// Validate validateAifGateResult function
try {
  const passBlock = '```aif-gate-result\n{"schema_version":1,"gate":"verify","status":"pass","blocking":false,"blockers":[],"affected_files":["src/Foo.php"],"suggested_next":{"command":"/aif-commit","reason":"ok"}}\n```';
  const vPass = validateAifGateResult(passBlock, { expectedStatus: 'pass' });
  if (!vPass.pass) throw new Error(`vPass failed: ${vPass.evidence}`);

  const failBlock = '```aif-gate-result\n{"schema_version":1,"gate":"verify","status":"fail","blocking":true,"blockers":[{"id":"ERR","severity":"error","file":"src/Foo.php","summary":"broken"}],"affected_files":["src/Foo.php"],"suggested_next":{"command":"/aif-fix","reason":"fix it"}}\n```';
  const vFail = validateAifGateResult(failBlock, { expectedStatus: 'fail' });
  if (!vFail.pass) throw new Error(`vFail failed: ${vFail.evidence}`);

  const vPassOnFail = validateAifGateResult(failBlock, { expectedStatus: 'pass' });
  if (vPassOnFail.pass) throw new Error('vPassOnFail should have failed');

  // Blocker file must be string if present
  const badFileBlock = '```aif-gate-result\n{"schema_version":1,"gate":"verify","status":"fail","blocking":true,"blockers":[{"id":"ERR","severity":"error","file":123,"summary":"broken"}],"affected_files":["src/Foo.php"],"suggested_next":{"command":"/aif-fix","reason":"fix it"}}\n```';
  const vBadFile = validateAifGateResult(badFileBlock, { expectedStatus: 'fail' });
  if (vBadFile.pass) throw new Error('vBadFile should have failed due to non-string file');

  // Status/blocking inconsistency without expectedStatus
  const inconsistentBlock = '```aif-gate-result\n{"schema_version":1,"gate":"verify","status":"fail","blocking":false,"blockers":[],"affected_files":["src/Foo.php"],"suggested_next":{"command":"/aif-commit","reason":"ok"}}\n```';
  const vInconsistent = validateAifGateResult(inconsistentBlock, { expectedStatus: null });
  if (vInconsistent.pass) throw new Error('vInconsistent should have failed due to status fail with blocking false');
} catch (e) {
  console.error(`FAIL gate-result-validation: ${e.message}`);
  bad++;
}

// Validate composer.json isolation from synthetic/stub composer.lock
try {
  const tmpCompDir = mkdtempSync(join(tmpdir(), 'comp-test-'));
  writeFileSync(join(tmpCompDir, 'composer.json'), JSON.stringify({
    name: 'test/project',
    type: 'project',
    require: { 'php': '>=8.2' }
  }));
  // Synthetic/stub lock file that does not contain require-dev information
  writeFileSync(join(tmpCompDir, 'composer.lock'), JSON.stringify({
    _readme: ['test'],
    packages: []
  }));

  const resJson = validateComposerJson(tmpCompDir);
  if (!resJson.skipped && !resJson.pass) {
    throw new Error(`validateComposerJson failed on isolated dir: ${resJson.evidence}`);
  }
} catch (e) {
  console.error(`FAIL composer-isolation-validation: ${e.message}`);
  bad++;
}

async function evalSample(id, sDir, kind) {
  const sample = join(sDir, `${kind}-sample`);
  const work = mkdtempSync(join(tmpdir(), `selftest-${id}-`));
  copyDir(join(sDir, 'fixture'), work);
  if (existsSync(sample)) copyDir(sample, work);
  const tPath = join(work, 'transcript.txt');
  const transcript = existsSync(tPath) ? readFileSync(tPath, 'utf8') : '';
  const changed = changedFiles(work, join(sDir, 'fixture')).filter((c) => c.path !== 'transcript.txt');
  const ctx = { dir: work, base: join(sDir, 'fixture'), transcript, changed, mode: 'selftest' };
  const checks = await runChecks(sDir, ctx);
  if (runtimeFlag && kind === 'positive') {
    const runtimeChecks = runRuntimeEvaluation(work, changed);
    checks.push(...runtimeChecks);
  }
  return checks;
}

for (const id of listScenarios(root)) {
  const sDir = join(root, 'scenarios', id);
  const sc = loadScenario(sDir);
  const missingGuides = (sc.guides ?? []).filter((g) => !existsSync(join(root, '..', 'skills', 'yii3', g)));
  const pos = await evalSample(id, sDir, 'positive');
  const posFailed = requiredFailed(pos);
  const neg = await evalSample(id, sDir, 'negative');
  const negFailedIds = neg.filter((r) => !r.pass).map((r) => r.id);
  const missing = (sc.negativeMustFail ?? []).filter((x) => !negFailedIds.includes(x));
  const okPos = posFailed.length === 0;
  const okNeg = missing.length === 0;
  const okGuides = missingGuides.length === 0;
  console.log(`${okPos && okNeg && okGuides ? 'OK  ' : 'FAIL'} ${id}  positive-required-failed=[${posFailed.map((r) => `${r.id}: ${r.evidence}`)}]  negative-not-caught=[${missing}]  guides-missing=[${missingGuides}]`);
  if (!okPos || !okNeg || !okGuides) bad++;
}
process.exit(bad ? 1 : 0);
