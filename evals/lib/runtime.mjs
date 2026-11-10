// Dependency-free PHP runtime verification tools for evaluations.
// node:* stdlib only. Detects local PHP / Composer or EVAL_DOCKER_IMAGE,
// runs syntax linting (php -l), composer validate, and test suites (phpunit).

import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, statSync, cpSync, symlinkSync, readFileSync, mkdtempSync, copyFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { join, relative, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const evalsRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

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

export function execComposer(args, cwd, toolchain = detectPhpToolchain()) {
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

export function validateComposerJson(workDir, toolchain = detectPhpToolchain(), { checkLock = false } = {}) {
  const composerJsonPath = join(workDir, 'composer.json');
  if (!existsSync(composerJsonPath)) {
    return { pass: true, skipped: true, evidence: 'composer.json not present in work dir (skipped)' };
  }
  if (!toolchain.hasComposer) {
    return { pass: true, skipped: true, evidence: 'composer CLI not available in environment or container (skipped)' };
  }

  if (checkLock) {
    const res = execComposer(['validate', '--no-check-all', '--no-check-publish'], workDir, toolchain);
    if (!res) {
      return { pass: true, skipped: true, evidence: 'failed to spawn composer executable' };
    }
    const output = `${res.stderr || ''}\n${res.stdout || ''}`.trim();
    const lockOutdated = /lock file is not up to date|lock file could not be|not up to date with the latest changes/i.test(output);
    if (res.status === 0 && !lockOutdated) {
      return { pass: true, skipped: false, evidence: 'composer.json and composer.lock are valid' };
    }
    return { pass: false, skipped: false, evidence: output || 'composer.json/lock validation failed' };
  }

  // Isolate composer.json in a clean ephemeral directory so Composer does not parse any synthetic/fixture composer.lock
  const isolatedDir = mkdtempSync(join(tmpdir(), 'composer-validate-'));
  try {
    copyFileSync(composerJsonPath, join(isolatedDir, 'composer.json'));
    const res = execComposer(['validate', '--no-check-all', '--no-check-publish', '--no-check-lock'], isolatedDir, toolchain);
    if (!res) {
      return { pass: true, skipped: true, evidence: 'failed to spawn composer executable' };
    }
    if (res.status === 0) {
      return { pass: true, skipped: false, evidence: 'composer.json is valid' };
    }
    return { pass: false, skipped: false, evidence: (res.stderr || res.stdout || 'composer.json validation failed').trim() };
  } finally {
    try {
      rmSync(isolatedDir, { recursive: true, force: true });
    } catch {}
  }
}

export function isStubComposerLock(lockPath) {
  try {
    if (!existsSync(lockPath)) return false;
    const content = readFileSync(lockPath, 'utf8');
    return /STUB|mock lock file/i.test(content);
  } catch {
    return false;
  }
}

export function validateComposerLock(workDir, toolchain = detectPhpToolchain()) {
  const composerLockPath = join(workDir, 'composer.lock');
  if (!existsSync(composerLockPath)) {
    return { pass: true, skipped: true, evidence: 'composer.lock not present in work dir (skipped)' };
  }
  return validateComposerJson(workDir, toolchain, { checkLock: true });
}

/**
 * Ensures a pre-warmed vendor directory is attached to the ephemeral work dir.
 * Supports:
 *   1. EVAL_PREWARMED_VENDOR / EVAL_VENDOR_DIR environment variable
 *   2. evals/cache/vendor local repository cache
 *   3. EVAL_AUTO_COMPOSER_INSTALL=1 (runs composer install if composer is detected)
 */
export function ensurePrewarmedVendor(workDir, toolchain = detectPhpToolchain()) {
  const targetVendor = join(workDir, 'vendor');
  if (existsSync(targetVendor)) {
    return { vendorPresent: true, source: 'workDir/vendor' };
  }

  const envVendor = process.env.EVAL_PREWARMED_VENDOR || process.env.EVAL_VENDOR_DIR || null;
  const defaultVendor = join(evalsRoot, 'cache', 'vendor');
  const candidateVendor = (envVendor && existsSync(envVendor)) ? envVendor : (existsSync(defaultVendor) ? defaultVendor : null);

  if (candidateVendor) {
    // Verify dependency lock compatibility when composer.json/composer.lock is present
    const hasWorkComposerJson = existsSync(join(workDir, 'composer.json'));
    const workLock = join(workDir, 'composer.lock');
    const hasWorkLock = existsSync(workLock);

    if (process.env.EVAL_VENDOR_IGNORE_LOCK !== '1') {
      if (hasWorkLock) {
        const cacheLockCandidate = join(dirname(candidateVendor), 'composer.lock');
        if (existsSync(cacheLockCandidate)) {
          const hWork = createHash('sha256').update(readFileSync(workLock)).digest('hex');
          const hCache = createHash('sha256').update(readFileSync(cacheLockCandidate)).digest('hex');
          if (hWork !== hCache) {
            // Prewarmed vendor was built for a different dependency lock - skip attaching
            return { vendorPresent: false, source: null, lockMismatch: true };
          }
        } else {
          // Prewarmed vendor has no sidecar composer.lock to verify compatibility against workDir lock
          return { vendorPresent: false, source: null, lockMissing: true };
        }
      } else if (hasWorkComposerJson) {
        // composer.json exists without composer.lock: dependency compatibility cannot be verified
        return { vendorPresent: false, source: null, lockMissing: true };
      }
    }

    try {
      cpSync(candidateVendor, targetVendor, { recursive: true });
      return { vendorPresent: true, source: candidateVendor };
    } catch {
      // Fallback: try symlink (or directory junction on Windows)
      try {
        symlinkSync(candidateVendor, targetVendor, 'junction');
        return { vendorPresent: true, source: `${candidateVendor} (symlinked)` };
      } catch {}
    }
  }

  if (process.env.EVAL_AUTO_COMPOSER_INSTALL === '1' && toolchain.hasComposer) {
    if (existsSync(join(workDir, 'composer.json'))) {
      const res = execComposer(['install', '--prefer-dist', '--no-progress', '--no-interaction', '--quiet'], workDir, toolchain);
      if (res && res.status === 0 && existsSync(targetVendor)) {
        return { vendorPresent: true, source: 'composer install' };
      }
    }
  }

  return { vendorPresent: false, source: null };
}

export function parsePhpUnitSummary(output) {
  if (typeof output !== 'string' || !output.trim()) return null;
  const okMatch = output.match(/OK\s*\((\d+)\s+tests?,\s*(\d+)\s+assertions?\)/i);
  if (okMatch) {
    return {
      tests: Number.parseInt(okMatch[1], 10),
      assertions: Number.parseInt(okMatch[2], 10),
      errors: 0,
      failures: 0,
      skipped: 0,
    };
  }
  const summaryMatch = output.match(/Tests:\s*(\d+),\s*Assertions:\s*(\d+)([^\n]*)/i);
  if (!summaryMatch) return null;
  const tail = summaryMatch[3] || '';
  const extract = (label) => {
    const m = tail.match(new RegExp(`${label}:\\s*(\\d+)`, 'i'));
    return m ? Number.parseInt(m[1], 10) : 0;
  };
  return {
    tests: Number.parseInt(summaryMatch[1], 10),
    assertions: Number.parseInt(summaryMatch[2], 10),
    errors: extract('Errors'),
    failures: extract('Failures'),
    skipped: extract('Skipped'),
  };
}

export function resolvePhpUnitBinary(workDir, options = {}) {
  const candidates = [
    options.phpunitBin || null,
    process.env.EVAL_PHPUNIT_BIN || null,
    join(workDir, 'vendor', 'phpunit', 'phpunit', 'phpunit'),
    join(workDir, 'vendor', 'bin', 'phpunit'),
  ].filter(Boolean);
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

export function hasPhpUnitConfig(workDir) {
  return (
    existsSync(join(workDir, 'phpunit.xml')) ||
    existsSync(join(workDir, 'phpunit.dist.xml')) ||
    existsSync(join(workDir, 'phpunit.xml.dist'))
  );
}

export function runPhpUnit(workDir, options = {}, toolchain = detectPhpToolchain()) {
  const requirePhpunit = Boolean(options.requirePhpunit || process.env.EVAL_REQUIRE_PHPUNIT === '1');
  if (options.attachPrewarmedVendor !== false) {
    ensurePrewarmedVendor(workDir, toolchain);
  }

  const hasConfig = hasPhpUnitConfig(workDir);
  const hasTestsDir = existsSync(join(workDir, 'tests'));
  const phpunitBin = resolvePhpUnitBinary(workDir, options);

  if (!hasConfig && !hasTestsDir) {
    return {
      pass: !requirePhpunit,
      skipped: !requirePhpunit,
      evidence: 'no PHPUnit configuration or tests directory found (skipped)',
    };
  }
  if (!phpunitBin) {
    return {
      pass: !requirePhpunit,
      skipped: !requirePhpunit,
      evidence: requirePhpunit
        ? 'PHPUnit required (--strict / EVAL_REQUIRE_PHPUNIT=1) but vendor/phpunit/phpunit/phpunit or vendor/bin/phpunit is not installed (run composer install)'
        : 'vendor/bin/phpunit not installed in work dir (skipped; composer install not run)',
    };
  }
  if (!toolchain.isAvailable) {
    return {
      pass: !requirePhpunit,
      skipped: !requirePhpunit,
      evidence: requirePhpunit
        ? 'PHPUnit required (--strict / EVAL_REQUIRE_PHPUNIT=1) but php CLI is not available in environment'
        : 'php CLI not available in environment (skipped)',
    };
  }

  const args = [phpunitBin, '--no-coverage'];
  const res = execPhp(args, workDir, toolchain);
  if (!res) {
    return {
      pass: !requirePhpunit,
      skipped: !requirePhpunit,
      evidence: 'failed to spawn phpunit executable',
    };
  }
  const combinedOutput = `${res.stdout || ''}\n${res.stderr || ''}`.trim();
  const summary = parsePhpUnitSummary(combinedOutput);
  if (res.status === 0) {
    const summaryNote = summary
      ? ` [tests=${summary.tests}, assertions=${summary.assertions}, skipped=${summary.skipped}]`
      : '';
    return {
      pass: true,
      skipped: false,
      summary,
      evidence: `${(res.stdout || 'PHPUnit passed').trim()}${summaryNote}`,
    };
  }
  return {
    pass: false,
    skipped: false,
    summary,
    evidence: (res.stderr || res.stdout || 'PHPUnit failed').trim(),
  };
}

export function runRuntimeEvaluation(workDir, changedFiles = null, toolchain = detectPhpToolchain(), options = {}) {
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

  // L4: Composer lock validation if a non-stub composer.lock exists
  const composerLockPath = join(workDir, 'composer.lock');
  if (existsSync(composerLockPath) && !isStubComposerLock(composerLockPath)) {
    const lockRes = validateComposerLock(workDir, toolchain);
    const lockRequired = !lockRes.skipped;
    results.push({
      id: 'runtime-composer-lock-validate',
      description: 'Composer lock validation (composer validate with lock)',
      required: lockRequired,
      pass: lockRes.pass,
      evidence: lockRes.evidence,
    });
  }

  // L5: Pre-warmed vendor layer
  const vendorStatus = ensurePrewarmedVendor(workDir, toolchain);
  if (vendorStatus.vendorPresent) {
    results.push({
      id: 'runtime-vendor-prewarmed',
      description: 'Pre-warmed vendor runtime layer attachment',
      required: false,
      pass: true,
      evidence: `Pre-warmed vendor layer attached (${vendorStatus.source})`,
    });
  }

  // L5: PHPUnit execution if tests/config exist or PHPUnit is required
  const requirePhpunit = Boolean(options.requirePhpunit || process.env.EVAL_REQUIRE_PHPUNIT === '1');
  const hasTests = existsSync(join(workDir, 'tests')) || hasPhpUnitConfig(workDir);
  if (hasTests || requirePhpunit) {
    const phpunit = runPhpUnit(workDir, { ...options, attachPrewarmedVendor: false }, toolchain);
    const phpunitRequired = !phpunit.skipped;
    results.push({
      id: 'runtime-phpunit',
      description: 'PHPUnit test suite execution',
      required: phpunitRequired,
      pass: phpunit.pass,
      summary: phpunit.summary || null,
      evidence: phpunit.evidence,
    });
  }

  return results;
}
