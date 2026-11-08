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
  const composerDockerImage = process.env.EVAL_COMPOSER_DOCKER_IMAGE || dockerImage;

  let hasPhp = false;
  let phpVersion = null;
  let isPhpVersionCompatible = false;
  let phpVersionWarning = null;

  try {
    const res = spawnSync(phpBin, ['-v'], { encoding: 'utf8', timeout: 5000 });
    if (res.status === 0 && res.stdout) {
      hasPhp = true;
      const match = res.stdout.match(/PHP\s+([0-9]+)\.([0-9]+)\.([0-9]+)/i);
      if (match) {
        phpVersion = `${match[1]}.${match[2]}.${match[3]}`;
        const major = Number(match[1]);
        const minor = Number(match[2]);
        isPhpVersionCompatible = major > 8 || (major === 8 && minor >= 2);
        if (!isPhpVersionCompatible) {
          phpVersionWarning = `Detected PHP ${phpVersion} is below required PHP >= 8.2 for Yii 3`;
        }
      } else {
        phpVersion = res.stdout.split('\n')[0].trim();
      }
    }
  } catch {}

  let hasComposer = false;
  let composerVersion = null;
  try {
    const res = spawnSync(composerBin, ['--version'], { encoding: 'utf8', timeout: 5000 });
    if (res.status === 0 && res.stdout) {
      hasComposer = true;
      const match = res.stdout.match(/Composer\s+version\s+([^\s]+)/i);
      composerVersion = match ? match[1] : res.stdout.split('\n')[0].trim();
    }
  } catch {}

  let hasDocker = false;
  if (dockerImage) {
    try {
      const res = spawnSync('docker', ['--version'], { encoding: 'utf8', timeout: 5000 });
      if (res.status === 0) hasDocker = true;
    } catch {}
  }

  let hasDockerComposer = false;
  if (hasDocker && composerDockerImage) {
    try {
      const res = spawnSync(
        'docker',
        ['run', '--rm', composerDockerImage, 'composer', '--version'],
        { encoding: 'utf8', timeout: 10000 }
      );
      if (res.status === 0 && res.stdout && /Composer/i.test(res.stdout)) {
        hasDockerComposer = true;
        if (!composerVersion) {
          const match = res.stdout.match(/Composer\s+version\s+([^\s]+)/i);
          composerVersion = match ? match[1] : 'docker';
        }
      }
    } catch {}
  }

  const composerAvailable = hasComposer || hasDockerComposer;

  cachedToolchain = {
    hasPhp,
    phpBin,
    phpVersion,
    isPhpVersionCompatible,
    phpVersionWarning,
    hasComposer: composerAvailable,
    composerBin,
    composerVersion,
    hasDocker,
    dockerImage,
    hasDockerComposer,
    composerDockerImage,
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
  if (toolchain.hasComposer && !toolchain.hasDockerComposer) {
    return spawnSync(toolchain.composerBin, args, { cwd, encoding: 'utf8', timeout: 30000 });
  }
  if (toolchain.hasDockerComposer) {
    const image = toolchain.composerDockerImage || toolchain.dockerImage;
    const dockerArgs = ['run', '--rm', '-v', `${cwd}:/app`, '-w', '/app', image, 'composer', ...args];
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

  const missingFiles = [];
  const filesToCheck = [];

  if (targetFiles) {
    for (const f of targetFiles) {
      const p = typeof f === 'string' ? f : f.abs || join(workDir, f.path || f);
      if (!p.endsWith('.php')) continue;
      if (existsSync(p)) {
        filesToCheck.push(p);
      } else {
        missingFiles.push(relative(workDir, p).replace(/\\/g, '/'));
      }
    }
  } else {
    filesToCheck.push(...findPhpFiles(workDir));
  }

  const errors = [];
  if (missingFiles.length > 0) {
    errors.push(...missingFiles.map((f) => `${f}: file does not exist on disk`));
  }

  for (const file of filesToCheck) {
    const relPath = relative(workDir, file).replace(/\\/g, '/');
    const res = lintPhpFile(file, toolchain);
    if (!res.pass) {
      errors.push(`${relPath}: ${res.evidence}`);
    }
  }

  if (filesToCheck.length === 0 && missingFiles.length === 0) {
    return { pass: true, skipped: false, count: 0, errors: [], evidence: 'no PHP files to lint' };
  }

  if (errors.length === 0) {
    const versionNote = toolchain.phpVersion ? ` (PHP ${toolchain.phpVersion})` : '';
    const warningNote = toolchain.phpVersionWarning ? ` [WARN: ${toolchain.phpVersionWarning}]` : '';
    return {
      pass: true,
      skipped: false,
      count: filesToCheck.length,
      errors: [],
      evidence: `All ${filesToCheck.length} PHP file(s) passed syntax check (php -l)${versionNote}${warningNote}`,
    };
  }

  return {
    pass: false,
    skipped: false,
    count: filesToCheck.length,
    errors,
    evidence: `Lint failure in ${errors.length} file(s):\n${errors.join('\n')}`,
  };
}

export function validateComposerJson(workDir, toolchain = detectPhpToolchain()) {
  const composerJsonPath = join(workDir, 'composer.json');
  if (!existsSync(composerJsonPath)) {
    return { pass: true, skipped: true, evidence: 'composer.json not present in work dir (skipped)' };
  }
  if (!toolchain.hasComposer) {
    return { pass: true, skipped: true, evidence: 'composer CLI not available in environment or container (skipped)' };
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
  const hasConfig =
    existsSync(join(workDir, 'phpunit.xml')) ||
    existsSync(join(workDir, 'phpunit.dist.xml'));
  const hasTestsDir = existsSync(join(workDir, 'tests'));
  const phpunitBin = join(workDir, 'vendor', 'bin', 'phpunit');
  const hasPhpunitBin = existsSync(phpunitBin);

  if (!hasConfig && !hasTestsDir) {
    return { pass: true, skipped: true, evidence: 'no PHPUnit configuration or tests directory found (skipped)' };
  }
  if (!hasPhpunitBin) {
    return {
      pass: true,
      skipped: true,
      evidence: 'vendor/bin/phpunit not installed in work dir (skipped; composer install not run)',
    };
  }
  if (!toolchain.isAvailable) {
    return { pass: true, skipped: true, evidence: 'php CLI not available in environment (skipped)' };
  }

  const args = [phpunitBin, '--no-coverage'];
  const res = execPhp(args, workDir, toolchain);
  if (!res) {
    return { pass: true, skipped: true, evidence: 'failed to spawn phpunit executable' };
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
  const lintRequired = !lint.skipped && toolchain.isPhpVersionCompatible;
  results.push({
    id: 'runtime-php-lint',
    description: 'PHP syntax check (php -l) on generated/modified files',
    required: lintRequired,
    pass: lint.pass,
    evidence: lint.evidence,
  });

  // L4: Composer validation if composer.json exists
  if (existsSync(join(workDir, 'composer.json'))) {
    const comp = validateComposerJson(workDir, toolchain);
    const compRequired = !comp.skipped;
    results.push({
      id: 'runtime-composer-validate',
      description: 'Composer validation (composer validate)',
      required: compRequired,
      pass: comp.pass,
      evidence: comp.evidence,
    });
  }

  // L5: PHPUnit execution if tests are present
  const hasTests =
    existsSync(join(workDir, 'tests')) ||
    existsSync(join(workDir, 'phpunit.xml')) ||
    existsSync(join(workDir, 'phpunit.dist.xml'));
  if (hasTests) {
    const phpunit = runPhpUnit(workDir, {}, toolchain);
    const phpunitRequired = !phpunit.skipped;
    results.push({
      id: 'runtime-phpunit',
      description: 'PHPUnit test suite execution',
      required: phpunitRequired,
      pass: phpunit.pass,
      evidence: phpunit.evidence,
    });
  }

  return results;
}
