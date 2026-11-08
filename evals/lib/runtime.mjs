// Dependency-free PHP runtime verification tools for evaluations.
// node:* stdlib only. Detects local PHP / Composer or EVAL_DOCKER_IMAGE,
// runs syntax linting (php -l), composer validate, and test suites (phpunit).

import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

let cachedToolchain = null;

export function detectPhpToolchain() {
  if (cachedToolchain) return cachedToolchain;

  const phpBin = process.env.PHP_BIN || 'php';
  const composerBin = process.env.COMPOSER_BIN || 'composer';
  const dockerImage = process.env.EVAL_DOCKER_IMAGE || null;

  let hasPhp = false;
  let phpVersion = null;
  try {
    const res = spawnSync(phpBin, ['-v'], { encoding: 'utf8', timeout: 5000 });
    if (res.status === 0 && res.stdout) {
      hasPhp = true;
      const match = res.stdout.match(/PHP\s+([0-9]+\.[0-9]+\.[0-9]+)/i);
      phpVersion = match ? match[1] : res.stdout.split('\n')[0].trim();
    }
  } catch { }

  let hasComposer = false;
  let composerVersion = null;
  try {
    const res = spawnSync(composerBin, ['--version'], { encoding: 'utf8', timeout: 5000 });
    if (res.status === 0 && res.stdout) {
      hasComposer = true;
      const match = res.stdout.match(/Composer\s+version\s+([^\s]+)/i);
      composerVersion = match ? match[1] : res.stdout.split('\n')[0].trim();
    }
  } catch { }

  let hasDocker = false;
  if (dockerImage) {
    try {
      const res = spawnSync('docker', ['--version'], { encoding: 'utf8', timeout: 5000 });
      if (res.status === 0) hasDocker = true;
    } catch { }
  }

  cachedToolchain = {
    hasPhp,
    phpBin,
    phpVersion,
    hasComposer,
    composerBin,
    composerVersion,
    hasDocker,
    dockerImage,
    isAvailable: hasPhp || (hasDocker && Boolean(dockerImage)),
  };

  return cachedToolchain;
}

export function resetToolchainCache() {
  cachedToolchain = null;
}

function execPhp(args, cwd, toolchain = detectPhpToolchain()) {
  if (toolchain.hasPhp) {
    return spawnSync(toolchain.phpBin, args, { cwd, encoding: 'utf8', timeout: 30000 });
  }
  if (toolchain.hasDocker && toolchain.dockerImage) {
    const dockerArgs = ['run', '--rm', '-v', `${cwd}:/app`, '-w', '/app', toolchain.dockerImage, 'php', ...args];
    return spawnSync('docker', dockerArgs, { encoding: 'utf8', timeout: 60000 });
  }
  return null;
}

function execComposer(args, cwd, toolchain = detectPhpToolchain()) {
  if (toolchain.hasComposer) {
    return spawnSync(toolchain.composerBin, args, { cwd, encoding: 'utf8', timeout: 30000 });
  }
  if (toolchain.hasDocker && toolchain.dockerImage) {
    const dockerArgs = ['run', '--rm', '-v', `${cwd}:/app`, '-w', '/app', toolchain.dockerImage, 'composer', ...args];
    return spawnSync('docker', dockerArgs, { encoding: 'utf8', timeout: 60000 });
  }
  return null;
}

function findPhpFiles(dir) {
  const files = [];
  if (!existsSync(dir)) return files;
  for (const name of readdirSync(dir)) {
    if (['vendor', 'node_modules', '.git'].includes(name)) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) files.push(...findPhpFiles(p));
    else if (name.endsWith('.php')) files.push(p);
  }
  return files;
}

export function lintPhpFile(absPath, toolchain = detectPhpToolchain()) {
  if (!toolchain.isAvailable) {
    return { pass: true, skipped: true, evidence: 'php CLI not available in environment (skipped)' };
  }
  const res = execPhp(['-l', absPath], process.cwd(), toolchain);
  if (!res) {
    return { pass: true, skipped: true, evidence: 'failed to spawn PHP executable' };
  }
  if (res.status === 0) {
    return { pass: true, skipped: false, evidence: 'syntax OK' };
  }
  const errorMsg = (res.stderr || res.stdout || 'Syntax error detected').trim();
  return { pass: false, skipped: false, evidence: errorMsg };
}

export function lintPhpFiles(workDir, targetFiles = null, toolchain = detectPhpToolchain()) {
  if (!toolchain.isAvailable) {
    return { pass: true, skipped: true, count: 0, errors: [], evidence: 'php CLI not available in environment (skipped)' };
  }

  const filesToCheck = targetFiles
    ? targetFiles.map((f) => (typeof f === 'string' ? f : f.abs || join(workDir, f.path || f))).filter((p) => p.endsWith('.php') && existsSync(p))
    : findPhpFiles(workDir);

  if (filesToCheck.length === 0) {
    return { pass: true, skipped: false, count: 0, errors: [], evidence: 'no PHP files to lint' };
  }

  const errors = [];
  for (const file of filesToCheck) {
    const relPath = relative(workDir, file).replace(/\\/g, '/');
    const res = lintPhpFile(file, toolchain);
    if (!res.pass) {
      errors.push(`${relPath}: ${res.evidence}`);
    }
  }

  if (errors.length === 0) {
    return {
      pass: true,
      skipped: false,
      count: filesToCheck.length,
      errors: [],
      evidence: `All ${filesToCheck.length} PHP file(s) passed syntax check (php -l)`,
    };
  }

  return {
    pass: false,
    skipped: false,
    count: errors.length,
    errors,
    evidence: `Syntax error(s) in ${errors.length}/${filesToCheck.length} PHP file(s):\n${errors.join('\n')}`,
  };
}

export function validateComposerJson(workDir, toolchain = detectPhpToolchain()) {
  const composerJsonPath = join(workDir, 'composer.json');
  if (!existsSync(composerJsonPath)) {
    return { pass: true, skipped: true, evidence: 'composer.json not present in work dir (skipped)' };
  }
  if (!toolchain.hasComposer && !toolchain.hasDocker) {
    return { pass: true, skipped: true, evidence: 'composer CLI not available in environment (skipped)' };
  }
  const res = execComposer(['validate', '--no-check-all', '--no-check-publish'], workDir, toolchain);
  if (!res) {
    return { pass: true, skipped: true, evidence: 'failed to spawn composer executable' };
  }
  if (res.status === 0) {
    return { pass: true, skipped: false, evidence: 'composer.json is valid' };
  }
  return { pass: false, skipped: false, evidence: (res.stderr || res.stdout || 'composer.json validation failed').trim() };
}

export function runPhpUnit(workDir, options = {}, toolchain = detectPhpToolchain()) {
  const phpunitBin = join(workDir, 'vendor', 'bin', 'phpunit');
  const hasPhpunit = existsSync(phpunitBin) || existsSync(join(workDir, 'phpunit.xml')) || existsSync(join(workDir, 'phpunit.dist.xml'));

  if (!hasPhpunit) {
    return { pass: true, skipped: true, evidence: 'phpunit configuration or binary not found in work dir (skipped)' };
  }
  if (!toolchain.isAvailable) {
    return { pass: true, skipped: true, evidence: 'php CLI not available in environment (skipped)' };
  }

  const args = existsSync(phpunitBin) ? [phpunitBin, '--no-coverage'] : ['-d', 'memory_limit=-1', 'vendor/bin/phpunit', '--no-coverage'];
  const res = execPhp(args, workDir, toolchain);
  if (!res) {
    return { pass: true, skipped: true, evidence: 'failed to spawn phpunit' };
  }
  if (res.status === 0) {
    return { pass: true, skipped: false, evidence: (res.stdout || 'PHPUnit passed').trim() };
  }
  return { pass: false, skipped: false, evidence: (res.stderr || res.stdout || 'PHPUnit failed').trim() };
}

export function runRuntimeEvaluation(workDir, changedFiles = null, toolchain = detectPhpToolchain()) {
  const results = [];

  // L4: Syntax check on changed files
  const lint = lintPhpFiles(workDir, changedFiles, toolchain);
  results.push({
    id: 'runtime-php-lint',
    description: 'PHP syntax check (php -l) on generated/modified files',
    required: false,
    pass: lint.pass,
    evidence: lint.evidence,
  });

  // L4: Composer validation if composer.json exists
  if (existsSync(join(workDir, 'composer.json'))) {
    const comp = validateComposerJson(workDir, toolchain);
    results.push({
      id: 'runtime-composer-validate',
      description: 'Composer validation (composer validate)',
      required: false,
      pass: comp.pass,
      evidence: comp.evidence,
    });
  }

  // L5: PHPUnit execution if tests are present
  const hasTests = existsSync(join(workDir, 'tests')) || existsSync(join(workDir, 'phpunit.xml'));
  if (hasTests) {
    const phpunit = runPhpUnit(workDir, {}, toolchain);
    results.push({
      id: 'runtime-phpunit',
      description: 'PHPUnit test suite execution',
      required: false,
      pass: phpunit.pass,
      evidence: phpunit.evidence,
    });
  }

  return results;
}

