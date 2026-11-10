#!/usr/bin/env node
// API Manifest Freshness & Upstream Drift Checker (Node >= 18, ESM, node:* stdlib only).
//
// Validates:
//   1. Both evals/data/api-symbols-manifest.json and evals/data/ast-signatures-manifest.json
//      exist, have valid ISO timestamps, and include complete per-package provenance metadata.
//   2. Cross-manifest parity: both manifests record identical packages and commit SHAs.
//   3. Local clone sync (when references/ exists): local HEAD matches recorded commit SHAs
//      (advisory warning by default; error under --strict).
//   4. Optional upstream drift (--upstream): runs `git ls-remote` against upstream remotes to
//      detect newer branch commits or newer semver tags (fails if --fail-on-drift is passed).
//
// Usage:
//   node scripts/check-manifest-freshness.mjs
//   node scripts/check-manifest-freshness.mjs --strict --max-age-days 60
//   node scripts/check-manifest-freshness.mjs --upstream --markdown
//   node scripts/check-manifest-freshness.mjs --upstream --fail-on-drift --json

import { execFile } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const referencesDir = join(root, 'references');
const symbolsManifestPath = join(root, 'evals', 'data', 'api-symbols-manifest.json');
const astManifestPath = join(root, 'evals', 'data', 'ast-signatures-manifest.json');

const args = process.argv.slice(2);
const isStrict = args.includes('--strict');
const checkUpstream = args.includes('--upstream');
const failOnDrift = args.includes('--fail-on-drift');
const jsonOutput = args.includes('--json');
const markdownOutput = args.includes('--markdown');

function getIntFlag(flag, fallback = null) {
  const idx = args.indexOf(flag);
  if (idx === -1) return fallback;
  const raw = args[idx + 1];
  if (!raw || !/^\d+$/.test(raw)) {
    console.error(`Invalid integer value for ${flag}: ${raw ?? '(missing)'}`);
    process.exit(2);
  }
  return Number.parseInt(raw, 10);
}

const maxAgeDays = getIntFlag('--max-age-days', null);
const limit = getIntFlag('--limit', null);
const concurrency = Math.max(1, getIntFlag('--concurrency', 8));

const errors = [];
const warnings = [];

function loadManifest(path, label) {
  if (!existsSync(path)) {
    errors.push(`${label} missing: ${path}`);
    return null;
  }
  let data;
  try {
    data = JSON.parse(readFileSync(path, 'utf8'));
  } catch (err) {
    errors.push(`${label} is invalid JSON: ${err.message}`);
    return null;
  }
  const meta = data?.metadata;
  if (!meta || typeof meta !== 'object') {
    errors.push(`${label} missing metadata object`);
    return null;
  }
  if (typeof meta.generated_at !== 'string' || Number.isNaN(Date.parse(meta.generated_at))) {
    errors.push(`${label} has invalid metadata.generated_at: ${String(meta.generated_at)}`);
  } else if (maxAgeDays !== null) {
    const ageMs = Date.now() - Date.parse(meta.generated_at);
    const ageDays = ageMs / (1000 * 60 * 60 * 24);
    if (ageDays > maxAgeDays) {
      errors.push(
        `${label} is stale: generated ${ageDays.toFixed(1)} days ago (max allowed: ${maxAgeDays} days). Re-run with --export-manifest.`,
      );
    }
  }
  if (!Array.isArray(meta.packages) || meta.packages.length === 0) {
    errors.push(`${label} missing non-empty metadata.packages provenance array`);
    return null;
  }
  if (typeof meta.packages_indexed === 'number' && meta.packages_indexed !== meta.packages.length) {
    errors.push(
      `${label} metadata.packages_indexed (${meta.packages_indexed}) does not match metadata.packages.length (${meta.packages.length})`,
    );
  }

  for (const pkg of meta.packages) {
    const id = pkg?.package || pkg?.dir || '(unknown)';
    if (typeof pkg?.package !== 'string' || pkg.package.trim() === '') {
      errors.push(`${label}: package entry missing non-empty "package" field`);
    }
    if (typeof pkg?.dir !== 'string' || pkg.dir.trim() === '') {
      errors.push(`${label} (${id}): missing non-empty "dir" field`);
    }
    if (typeof pkg?.commit !== 'string' || !/^[0-9a-f]{40}$/.test(pkg.commit)) {
      errors.push(`${label} (${id}): invalid or missing 40-hex commit SHA "${String(pkg?.commit)}"`);
    }
    if (typeof pkg?.commit_date !== 'string' || Number.isNaN(Date.parse(pkg.commit_date))) {
      errors.push(`${label} (${id}): invalid or missing commit_date "${String(pkg?.commit_date)}"`);
    }
    if (typeof pkg?.branch !== 'string' || pkg.branch.trim() === '') {
      errors.push(`${label} (${id}): missing non-empty "branch" field`);
    }
    if (typeof pkg?.remote !== 'string' || pkg.remote.trim() === '') {
      errors.push(`${label} (${id}): missing non-empty "remote" field`);
    }
  }

  return data;
}

function compareManifests(symData, astData) {
  if (!symData?.metadata?.packages || !astData?.metadata?.packages) return;
  const symMap = new Map(symData.metadata.packages.map((p) => [p.package, p]));
  const astMap = new Map(astData.metadata.packages.map((p) => [p.package, p]));

  for (const [name, symPkg] of symMap) {
    const astPkg = astMap.get(name);
    if (!astPkg) {
      errors.push(`Cross-manifest parity mismatch: ${name} present in api-symbols-manifest.json but missing in ast-signatures-manifest.json`);
      continue;
    }
    if (symPkg.commit !== astPkg.commit) {
      errors.push(
        `Cross-manifest SHA mismatch for ${name}: symbols=${symPkg.commit} vs ast=${astPkg.commit}. Regenerate both manifests together.`,
      );
    }
    if (symPkg.dir !== astPkg.dir) {
      errors.push(`Cross-manifest dir mismatch for ${name}: symbols=${symPkg.dir} vs ast=${astPkg.dir}`);
    }
  }
  for (const name of astMap.keys()) {
    if (!symMap.has(name)) {
      errors.push(`Cross-manifest parity mismatch: ${name} present in ast-signatures-manifest.json but missing in api-symbols-manifest.json`);
    }
  }
}

async function runPool(items, maxConcurrency, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  async function next() {
    while (cursor < items.length) {
      const idx = cursor++;
      results[idx] = await worker(items[idx], idx);
    }
  }
  const runners = Array.from({ length: Math.min(maxConcurrency, items.length) }, () => next());
  await Promise.all(runners);
  return results;
}

async function checkLocalClones(packages) {
  if (!existsSync(referencesDir)) {
    return { checked: false, drifted: [], missing: [] };
  }
  const drifted = [];
  const missing = [];
  await runPool(packages, Math.max(concurrency, 10), async (pkg) => {
    const pkgDir = join(referencesDir, pkg.dir);
    if (!existsSync(pkgDir)) {
      missing.push(pkg.dir);
      const msg = `Local references clone missing for ${pkg.package} (${pkg.dir})`;
      if (isStrict) errors.push(msg);
      else warnings.push(msg);
      return;
    }
    try {
      const { stdout } = await execFileAsync('git', ['-C', pkgDir, 'rev-parse', 'HEAD'], {
        encoding: 'utf8',
        timeout: 5000,
      });
      const localHead = stdout.trim();
      if (localHead !== pkg.commit) {
        drifted.push({ package: pkg.package, manifestCommit: pkg.commit, localHead });
        const msg = `Local clone drift for ${pkg.package}: manifest=${pkg.commit.slice(0, 8)} vs local HEAD=${localHead.slice(0, 8)}`;
        if (isStrict) errors.push(msg);
        else warnings.push(msg);
      }
    } catch (err) {
      const msg = `Failed to inspect git HEAD for references/${pkg.dir}: ${err.message}`;
      if (isStrict) errors.push(msg);
      else warnings.push(msg);
    }
  });
  return { checked: true, drifted, missing };
}

function parseSemver(tag) {
  if (!tag) return null;
  const clean = tag.replace(/^v/, '');
  const m = clean.match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!m) return null;
  return [Number.parseInt(m[1], 10), Number.parseInt(m[2], 10), Number.parseInt(m[3], 10)];
}

function compareSemver(a, b) {
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return 0;
}

async function inspectUpstreamPackage(pkg) {
  try {
    const { stdout } = await execFileAsync('git', ['ls-remote', '--heads', '--tags', pkg.remote], {
      encoding: 'utf8',
      timeout: 15000,
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
    });
    const branchRef = `refs/heads/${pkg.branch}`;
    let remoteBranchSha = null;
    const tagShas = new Map();
    for (const line of stdout.split(/\r?\n/)) {
      if (!line.trim()) continue;
      const [sha, ref] = line.split(/\s+/);
      if (!sha || !ref) continue;
      if (ref === branchRef) {
        remoteBranchSha = sha;
      } else if (ref.startsWith('refs/tags/')) {
        const isPeeled = ref.endsWith('^{}');
        const tagName = ref.slice('refs/tags/'.length).replace(/\^\{\}$/, '');
        if (!tagShas.has(tagName) || isPeeled) {
          tagShas.set(tagName, sha);
        }
      }
    }

    let highestTag = null;
    let highestTagSemver = null;
    for (const tagName of tagShas.keys()) {
      const parsed = parseSemver(tagName);
      if (!parsed) continue;
      if (!highestTagSemver || compareSemver(parsed, highestTagSemver) > 0) {
        highestTagSemver = parsed;
        highestTag = tagName;
      }
    }

    const recordedSemver = parseSemver(pkg.nearest_tag);
    const newerTag =
      highestTagSemver && (!recordedSemver || compareSemver(highestTagSemver, recordedSemver) > 0)
        ? highestTag
        : null;
    const branchDrifted = Boolean(remoteBranchSha && remoteBranchSha !== pkg.commit);

    return {
      package: pkg.package,
      branch: pkg.branch,
      manifestCommit: pkg.commit,
      remoteCommit: remoteBranchSha,
      manifestTag: pkg.nearest_tag || null,
      latestTag: highestTag,
      branchDrifted,
      newerTag,
      error: null,
    };
  } catch (err) {
    return {
      package: pkg.package,
      branch: pkg.branch,
      manifestCommit: pkg.commit,
      remoteCommit: null,
      manifestTag: pkg.nearest_tag || null,
      latestTag: null,
      branchDrifted: false,
      newerTag: null,
      error: err.message.split(/\r?\n/)[0],
    };
  }
}

async function runUpstreamCheck(packages) {
  const target = limit ? packages.slice(0, limit) : packages;
  const rows = await runPool(target, concurrency, inspectUpstreamPackage);
  const branchDrifted = rows.filter((r) => r.branchDrifted);
  const newerTagAvailable = rows.filter((r) => r.newerTag !== null);
  const remoteErrors = rows.filter((r) => r.error !== null);
  return {
    checkedCount: rows.length,
    upToDateCount: rows.filter((r) => !r.branchDrifted && !r.newerTag && !r.error).length,
    branchDrifted,
    newerTagAvailable,
    remoteErrors,
    rows,
  };
}

function formatMarkdown(report) {
  const lines = [];
  lines.push('# Yii 3 API Manifest Freshness Report');
  lines.push('');
  lines.push(`- **Symbols manifest generated:** \`${report.symbolsGeneratedAt || 'missing'}\``);
  lines.push(`- **AST manifest generated:** \`${report.astGeneratedAt || 'missing'}\``);
  lines.push(`- **Packages indexed:** ${report.packagesCount}`);
  lines.push(`- **Offline & cross-manifest parity:** ${report.errors.length === 0 ? 'PASS' : `FAIL (${report.errors.length} error(s))`}`);
  if (report.localCheck.checked) {
    lines.push(
      `- **Local \`references/\` clone sync:** ${report.localCheck.drifted.length === 0 && report.localCheck.missing.length === 0 ? 'IN SYNC' : `${report.localCheck.drifted.length} drifted, ${report.localCheck.missing.length} missing`}`,
    );
  }
  if (report.upstream) {
    lines.push('');
    lines.push('## Upstream Drift Summary');
    lines.push('');
    lines.push(`| Metric | Count |`);
    lines.push(`| :--- | :--- |`);
    lines.push(`| Packages checked | ${report.upstream.checkedCount} |`);
    lines.push(`| Exact match (up to date) | ${report.upstream.upToDateCount} |`);
    lines.push(`| Branch commit drift | ${report.upstream.branchDrifted.length} |`);
    lines.push(`| Newer semver tag available | ${report.upstream.newerTagAvailable.length} |`);
    lines.push(`| Remote lookup errors | ${report.upstream.remoteErrors.length} |`);

    const drifted = report.upstream.rows.filter((r) => r.branchDrifted || r.newerTag);
    if (drifted.length > 0) {
      lines.push('');
      lines.push('### Drifted Packages');
      lines.push('');
      lines.push('| Package | Manifest SHA | Remote SHA | Manifest Tag | Latest Tag |');
      lines.push('| :--- | :--- | :--- | :--- | :--- |');
      for (const r of drifted.slice(0, 50)) {
        lines.push(
          `| \`${r.package}\` | \`${r.manifestCommit.slice(0, 8)}\` | \`${(r.remoteCommit || 'n/a').slice(0, 8)}\` | ${r.manifestTag || '—'} | ${r.latestTag || '—'} |`,
        );
      }
      if (drifted.length > 50) {
        lines.push(`\n_Showing first 50 of ${drifted.length} drifted packages._`);
      }
    }
    if (report.upstream.remoteErrors.length > 0) {
      lines.push('');
      lines.push('### Remote Lookup Errors');
      lines.push('');
      for (const r of report.upstream.remoteErrors.slice(0, 20)) {
        lines.push(`- \`${r.package}\`: ${r.error}`);
      }
    }
  }
  return `${lines.join('\n')}\n`;
}

async function main() {
  const symData = loadManifest(symbolsManifestPath, 'api-symbols-manifest.json');
  const astData = loadManifest(astManifestPath, 'ast-signatures-manifest.json');
  compareManifests(symData, astData);

  const packages = symData?.metadata?.packages || [];
  const localCheck = packages.length > 0
    ? await checkLocalClones(packages)
    : { checked: false, drifted: [], missing: [] };

  let upstream = null;
  if (checkUpstream && packages.length > 0) {
    upstream = await runUpstreamCheck(packages);
    if (failOnDrift && (upstream.branchDrifted.length > 0 || upstream.newerTagAvailable.length > 0)) {
      errors.push(
        `Upstream drift detected: ${upstream.branchDrifted.length} package(s) behind branch HEAD, ${upstream.newerTagAvailable.length} package(s) with newer semver tags.`,
      );
    }
    if (upstream.remoteErrors.length > 0) {
      const msg = `Upstream ls-remote failed for ${upstream.remoteErrors.length} package(s).`;
      if (failOnDrift) errors.push(msg);
      else warnings.push(msg);
    }
  }

  const report = {
    status: errors.length === 0 ? 'pass' : 'fail',
    symbolsGeneratedAt: symData?.metadata?.generated_at || null,
    astGeneratedAt: astData?.metadata?.generated_at || null,
    packagesCount: packages.length,
    localCheck,
    upstream,
    warnings,
    errors,
  };

  if (jsonOutput) {
    console.log(JSON.stringify(report, null, 2));
  } else if (markdownOutput) {
    process.stdout.write(formatMarkdown(report));
  } else {
    console.log(`check-manifest-freshness: ${packages.length} packages verified (symbols=${report.symbolsGeneratedAt || 'missing'}, ast=${report.astGeneratedAt || 'missing'})`);
    if (localCheck.checked) {
      console.log(`  local references/: ${localCheck.drifted.length} drifted, ${localCheck.missing.length} missing`);
    } else {
      console.log('  local references/: not present (offline manifest validation only)');
    }
    if (upstream) {
      console.log(
        `  upstream drift: checked=${upstream.checkedCount}, up_to_date=${upstream.upToDateCount}, branch_drift=${upstream.branchDrifted.length}, newer_tag=${upstream.newerTagAvailable.length}, errors=${upstream.remoteErrors.length}`,
      );
    }
    for (const w of warnings) console.warn(`  [WARN] ${w}`);
    for (const e of errors) console.error(`  [FAIL] ${e}`);
  }

  process.exit(errors.length > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
