#!/usr/bin/env node
// L5 Yii 3 PHPUnit Runtime Integration Runner (Node >= 18, ESM, node:* stdlib only).
//
// Runs L4/L5 verification against evals/runtime-harness/:
//   - PHP availability & version >= 8.2
//   - pdo_sqlite extension check
//   - PHP syntax check across src/, config/, tests/
//   - Composer validation (composer validate)
//   - Optional --install to run composer install when vendor/ is missing
//   - Real PHPUnit integration test suite execution (runtime-phpunit)
//
// Behaviour when PHP / vendor/ is unavailable:
//   - Default (local developer machine without PHP/vendor): logs skip reason and exits 0.
//   - --strict (CI php-runtime-gates job): fails loudly (exit 1) if PHP, pdo_sqlite, or vendor/phpunit is missing.

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  detectPhpToolchain,
  execComposer,
  resolvePhpUnitBinary,
  runRuntimeEvaluation,
} from '../evals/lib/runtime.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const harnessDir = join(root, 'evals', 'runtime-harness');

const args = process.argv.slice(2);
const strict = args.includes('--strict') || process.env.EVAL_REQUIRE_PHPUNIT === '1';
const autoInstall = args.includes('--install');

function hasPdoSqliteExtension(toolchain) {
  if (!toolchain.isAvailable) return false;
  if (toolchain.preferredPhpRuntime === 'local') {
    const res = spawnSync(toolchain.phpBin, ['-m'], { encoding: 'utf8', timeout: 5000 });
    return res.status === 0 && /\bpdo_sqlite\b/i.test(res.stdout || '');
  }
  if (toolchain.preferredPhpRuntime === 'docker' && toolchain.dockerImage) {
    const res = spawnSync('docker', ['run', '--rm', toolchain.dockerImage, 'php', '-m'], {
      encoding: 'utf8',
      timeout: 15000,
    });
    return res.status === 0 && /\bpdo_sqlite\b/i.test(res.stdout || '');
  }
  return false;
}

function handleMissingPrerequisite(reason) {
  if (strict) {
    console.error(`[FAIL] test-php-runtime (--strict): ${reason}`);
    process.exit(1);
  }
  console.log(`[SKIP] test-php-runtime: ${reason}`);
  process.exit(0);
}

function main() {
  if (!existsSync(harnessDir)) {
    console.error(`[FAIL] test-php-runtime: missing runtime harness directory at ${harnessDir}`);
    process.exit(1);
  }

  const toolchain = detectPhpToolchain();
  if (!toolchain.isAvailable) {
    handleMissingPrerequisite('PHP CLI (or EVAL_DOCKER_IMAGE) not available in environment');
  }
  if (!toolchain.isPhpVersionCompatible) {
    const msg = toolchain.phpVersionWarning || `PHP >= 8.2 required, found ${toolchain.phpVersion}`;
    if (strict) {
      console.error(`[FAIL] test-php-runtime (--strict): ${msg}`);
      process.exit(1);
    }
    handleMissingPrerequisite(msg);
  }

  if (!hasPdoSqliteExtension(toolchain)) {
    handleMissingPrerequisite('PHP extension pdo_sqlite is not loaded');
  }

  const vendorAutoload = join(harnessDir, 'vendor', 'autoload.php');
  if (!existsSync(vendorAutoload) && autoInstall) {
    if (!toolchain.hasComposer) {
      handleMissingPrerequisite('Composer CLI required for --install but not available');
    }
    console.log('[INFO] Installing evals/runtime-harness dependencies via Composer...');
    const installRes = execComposer(
      ['install', '--no-interaction', '--no-progress', '--prefer-dist'],
      harnessDir,
      toolchain,
    );
    if (!installRes || installRes.status !== 0) {
      console.error(`[FAIL] composer install failed:\n${installRes?.stderr || installRes?.stdout || 'unknown error'}`);
      process.exit(1);
    }
  }

  if (!existsSync(vendorAutoload) || !resolvePhpUnitBinary(harnessDir)) {
    handleMissingPrerequisite(
      'evals/runtime-harness/vendor/autoload.php or phpunit binary missing (run `composer install` in evals/runtime-harness or pass --install)',
    );
  }

  const results = runRuntimeEvaluation(harnessDir, null, toolchain, {
    requirePhpunit: strict,
    attachPrewarmedVendor: false,
  });

  let failed = 0;
  for (const r of results) {
    const label = r.pass ? 'PASS' : 'FAIL';
    const req = r.required ? 'required' : 'advisory';
    console.log(`[${label}] (${req}) ${r.id}: ${r.description}`);
    if (!r.pass && (r.required || strict)) {
      failed++;
      console.error(`  -> ${r.evidence}`);
    } else if (r.summary) {
      console.log(`  -> tests=${r.summary.tests}, assertions=${r.summary.assertions}, errors=${r.summary.errors}, failures=${r.summary.failures}, skipped=${r.summary.skipped}`);
    }
  }

  const phpunitResult = results.find((r) => r.id === 'runtime-phpunit');
  if (strict && (!phpunitResult || !phpunitResult.pass)) {
    if (failed === 0) failed++;
  }

  if (failed > 0) {
    console.error(`\n[FAIL] test-php-runtime failed with ${failed} failing check(s).`);
    process.exit(1);
  }

  console.log('\n[PASS] L5 PHPUnit runtime integration harness passed all checks.');
  process.exit(0);
}

main();
