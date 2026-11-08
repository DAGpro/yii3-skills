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

  // 1. Detect local PHP
  let hasLocalPhp = false;
  let localPhpVersion = null;
  let isLocalPhpCompatible = false;
  let isLocalPhpVersionUnknown = false;
  try {
    const res = spawnSync(phpBin, ['-v'], { encoding: 'utf8', timeout: 5000 });
    if (res.status === 0 && res.stdout) {
      hasLocalPhp = true;
      const match = res.stdout.match(/PHP\s+([0-9]+)\.([0-9]+)\.([0-9]+)/i);
      if (match) {
        localPhpVersion = `${match[1]}.${match[2]}.${match[3]}`;
        const major = Number(match[1]);
        const minor = Number(match[2]);
        isLocalPhpCompatible = major > 8 || (major === 8 && minor >= 2);
      } else {
        localPhpVersion = res.stdout.split('\n')[0].trim();
        isLocalPhpVersionUnknown = true;
      }
    }
  } catch {}

  // 2. Detect Docker support
  let hasDocker = false;
  if (dockerImage) {
    try {
      const res = spawnSync('docker', ['--version'], { encoding: 'utf8', timeout: 5000 });
      if (res.status === 0) hasDocker = true;
    } catch {}
  }

  // 3. Detect Docker PHP when Docker is configured
  let hasDockerPhp = false;
  let dockerPhpVersion = null;
  let isDockerPhpCompatible = false;
  let isDockerPhpVersionUnknown = false;
  if (hasDocker && dockerImage) {
    try {
      const res = spawnSync('docker', ['run', '--rm', dockerImage, 'php', '-v'], {
        encoding: 'utf8',
        timeout: 10000,
      });
      if (res.status === 0 && res.stdout) {
        hasDockerPhp = true;
        const match = res.stdout.match(/PHP\s+([0-9]+)\.([0-9]+)\.([0-9]+)/i);
        if (match) {
          dockerPhpVersion = `${match[1]}.${match[2]}.${match[3]}`;
          const major = Number(match[1]);
          const minor = Number(match[2]);
          isDockerPhpCompatible = major > 8 || (major === 8 && minor >= 2);
        } else {
          dockerPhpVersion = res.stdout.split('\n')[0].trim();
          isDockerPhpVersionUnknown = true;
        }
      }
    } catch {}
  }

  // 4. Select preferred PHP runner: prioritize compatible PHP (>= 8.2)
  let preferredPhpRuntime = null;
  let activePhpVersion = null;
  let isPhpVersionCompatible = false;
  let isPhpVersionUnknown = false;
  let phpVersionWarning = null;

  if (hasLocalPhp && isLocalPhpCompatible) {
    preferredPhpRuntime = 'local';
    activePhpVersion = localPhpVersion;
    isPhpVersionCompatible = true;
  } else if (hasDockerPhp && isDockerPhpCompatible) {
    preferredPhpRuntime = 'docker';
    activePhpVersion = dockerPhpVersion;
    isPhpVersionCompatible = true;
  } else if (hasLocalPhp && !isLocalPhpVersionUnknown) {
    preferredPhpRuntime = 'local';
    activePhpVersion = localPhpVersion;
    isPhpVersionCompatible = false;
    phpVersionWarning = `Local PHP ${localPhpVersion} is below required PHP >= 8.2 for Yii 3`;
  } else if (hasDockerPhp && !isDockerPhpVersionUnknown) {
    preferredPhpRuntime = 'docker';
    activePhpVersion = dockerPhpVersion;
    isPhpVersionCompatible = false;
    phpVersionWarning = `Docker PHP ${dockerPhpVersion} is below required PHP >= 8.2 for Yii 3`;
  } else if (hasLocalPhp) {
    preferredPhpRuntime = 'local';
    activePhpVersion = localPhpVersion;
    isPhpVersionCompatible = false;
    isPhpVersionUnknown = true;
    phpVersionWarning = `Unable to determine local PHP version from: "${localPhpVersion}"`;
  } else if (hasDockerPhp) {
    preferredPhpRuntime = 'docker';
    activePhpVersion = dockerPhpVersion;
    isPhpVersionCompatible = false;
    isPhpVersionUnknown = true;
    phpVersionWarning = `Unable to determine Docker PHP version from: "${dockerPhpVersion}"`;
  }

  // 5. Detect local Composer
  let hasLocalComposer = false;
  let localComposerVersion = null;
  try {
    const res = spawnSync(composerBin, ['--version'], { encoding: 'utf8', timeout: 5000 });
    if (res.status === 0 && res.stdout) {
      hasLocalComposer = true;
      const match = res.stdout.match(/Composer\s+version\s+([^\s]+)/i);
      localComposerVersion = match ? match[1] : res.stdout.split('\n')[0].trim();
    }
  } catch {}

  // 6. Detect Docker Composer
  let hasDockerComposer = false;
  let dockerComposerVersion = null;
  if (hasDocker && composerDockerImage) {
    try {
      const res = spawnSync(
        'docker',
        ['run', '--rm', composerDockerImage, 'composer', '--version'],
        { encoding: 'utf8', timeout: 10000 }
      );
      if (res.status === 0 && res.stdout && /Composer/i.test(res.stdout)) {
        hasDockerComposer = true;
        const match = res.stdout.match(/Composer\s+version\s+([^\s]+)/i);
        dockerComposerVersion = match ? match[1] : 'docker';
      }
    } catch {}
  }

  // 7. Select preferred Composer runner: local has priority, Docker is fallback
  let preferredComposerRuntime = null;
  let activeComposerVersion = null;
  if (hasLocalComposer) {
    preferredComposerRuntime = 'local';
    activeComposerVersion = localComposerVersion;
  } else if (hasDockerComposer) {
    preferredComposerRuntime = 'docker';
    activeComposerVersion = dockerComposerVersion;
  }

  cachedToolchain = {
    hasPhp: Boolean(preferredPhpRuntime),
    preferredPhpRuntime,
    phpBin,
    phpVersion: activePhpVersion,
    isPhpVersionCompatible,
    isPhpVersionUnknown,
    phpVersionWarning,
    hasComposer: Boolean(preferredComposerRuntime),
    preferredComposerRuntime,
    composerBin,
    composerVersion: activeComposerVersion,
    hasDocker,
    dockerImage,
    composerDockerImage,
    isAvailable: Boolean(preferredPhpRuntime),
  };

  return cachedToolchain;
}

export function resetToolchainCache() {
  cachedToolchain = null;
}

function execPhp(args, cwd, toolchain = detectPhpToolchain()) {
  if (toolchain.preferredPhpRuntime === 'local') {
    return spawnSync(toolchain.phpBin, args, { cwd, encoding: 'utf8', timeout: 30000 });
  }
  if (toolchain.preferredPhpRuntime === 'docker' && toolchain.dockerImage) {
    const dockerArgs = ['run', '--rm', '-v', `${cwd}:/app`, '-w', '/app', toolchain.dockerImage, 'php', ...args];
    return spawnSync('docker', dockerArgs, { encoding: 'utf8', timeout: 60000 });
  }
  return null;
}

function execComposer(args, cwd, toolchain = detectPhpToolchain()) {
  if (toolchain.preferredComposerRuntime === 'local') {
    return spawnSync(toolchain.composerBin, args, { cwd, encoding: 'utf8', timeout: 30000 });
  }
  if (toolchain.preferredComposerRuntime === 'docker') {
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
  const customPhpunitBin = process.env.EVAL_PHPUNIT_BIN || null;
  const phpunitBin = customPhpunitBin || join(workDir, 'vendor', 'bin', 'phpunit');
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

  // L4: PHP runtime availability check
  results.push({
    id: 'runtime-php-availability',
    description: 'PHP CLI or container runtime availability check',
    required: false,
    pass: toolchain.isAvailable,
    evidence: toolchain.isAvailable
      ? `PHP runtime available via ${toolchain.preferredPhpRuntime} (${toolchain.phpVersion || 'version unverified'})`
      : 'PHP runtime not detected in environment or Docker (skipped)',
  });

  // L4: PHP version compatibility check
  if (toolchain.isAvailable) {
    const isUnknown = toolchain.isPhpVersionUnknown;
    results.push({
      id: 'runtime-php-version',
      description: 'PHP version compatibility check (PHP >= 8.2)',
      required: true,
      pass: toolchain.isPhpVersionCompatible && !isUnknown,
      evidence: isUnknown
        ? `BLOCKED: Unable to determine PHP version: ${toolchain.phpVersion}`
        : toolchain.isPhpVersionCompatible
          ? `Compatible PHP runtime detected: ${toolchain.phpVersion} (${toolchain.preferredPhpRuntime})`
          : (toolchain.phpVersionWarning || `PHP ${toolchain.phpVersion} is incompatible with PHP >= 8.2 requirement`),
    });
  } else {
    results.push({
      id: 'runtime-php-version',
      description: 'PHP version compatibility check (PHP >= 8.2)',
      required: false,
      pass: true,
      evidence: 'PHP runtime not detected in environment or Docker (skipped)',
    });
  }

  // L4: Syntax check on changed files
  const lint = lintPhpFiles(workDir, changedFiles, toolchain);
  const lintRequired = !lint.skipped;
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
