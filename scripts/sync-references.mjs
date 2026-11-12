#!/usr/bin/env node
// Reference Package Lock & Sync Tool (Node >= 18, ESM, node:* stdlib only).
//
// Manages references/packages.lock.json independently of evals/ manifests.
// Keeps local clones pinned to exact commits and supports fetching history/tags
// without moving HEAD so skill guides can be updated from package diffs.
//
// Subcommands:
//   lock           Snapshot current references/* HEAD commits into references/packages.lock.json
//   status         Verify local references/* match references/packages.lock.json (default)
//   restore        Clone missing packages and reset clones to locked commits
//   fetch-history  Unshallow (or deepen) clones and fetch tags without moving HEAD
//   diff           Show commits between local HEAD and origin/<branch> (after fetch-history)
//   bump           Advance --pkg <name> (or --all) to origin/<branch> (or --to <ref>) and re-lock
//
// Flags:
//   --pkg <name>        Filter to one package (e.g. yiisoft/di or di); repeatable
//   --all               Target all packages (required for bump without --pkg)
//   --to <ref>          Target git ref for bump (default: origin/<branch>)
//   --since <YYYY-MM-DD> Fetch history since date instead of full --unshallow
//   --depth <N>         Deepen shallow clones by N commits instead of full --unshallow
//   --stat              Include file diffstat in `diff` output
//   --concurrency <N>   Parallel git operations (default: 8)
//   --force             Overwrite dirty working trees in restore/bump
//   --help              Show usage

import { execFile } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const referencesDir = join(root, 'references');
const lockPath = join(referencesDir, 'packages.lock.json');

const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h')) {
  console.log(`Usage: node scripts/sync-references.mjs <command> [options]

Commands:
  status         Compare local references/* against references/packages.lock.json (default)
  lock           Write references/packages.lock.json from current references/* clones
  restore        Clone missing packages and align existing clones to locked commits
  fetch-history  Fetch commit history and tags without advancing HEAD
  diff           Show unmerged upstream commits (HEAD..origin/<branch>)
  bump           Move --pkg <name> (or --all) to origin/<branch> (or --to <ref>) and update lock

Options:
  --pkg <name>         Package name or dir (e.g. yiisoft/di or di); may be repeated
  --all                Apply bump to all packages
  --to <ref>           Target ref for bump (default: origin/<branch>)
  --since <YYYY-MM-DD> Use git fetch --shallow-since=<date> in fetch-history
  --depth <N>          Use git fetch --deepen=<N> in fetch-history
  --stat               Show git diff --stat in diff output
  --concurrency <N>    Max concurrent git processes (default: 8)
  --force              Discard local uncommitted changes during restore/bump`);
  process.exit(0);
}

const KNOWN_COMMANDS = new Set(['status', 'lock', 'restore', 'fetch-history', 'diff', 'bump']);
const command = args[0] && !args[0].startsWith('-') ? args[0] : 'status';
if (!KNOWN_COMMANDS.has(command)) {
  console.error(`Unknown command: ${command}. Run with --help for usage.`);
  process.exit(2);
}

function getFlagValues(flag) {
  const values = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === flag && args[i + 1] && !args[i + 1].startsWith('-')) {
      values.push(args[i + 1]);
    }
  }
  return values;
}

function getFlagValue(flag, fallback = null) {
  const vals = getFlagValues(flag);
  return vals.length > 0 ? vals[vals.length - 1] : fallback;
}

const pkgFilters = new Set(getFlagValues('--pkg').map((v) => v.replace(/^yiisoft\//, '').toLowerCase()));
const hasAllFlag = args.includes('--all');
const toRef = getFlagValue('--to', null);
const sinceDate = getFlagValue('--since', null);
const deepenRaw = getFlagValue('--depth', null);
const showStat = args.includes('--stat');
const force = args.includes('--force');
const concurrency = Math.max(1, Number.parseInt(getFlagValue('--concurrency', '8'), 10) || 8);

if (deepenRaw !== null && !/^\d+$/.test(deepenRaw)) {
  console.error(`Invalid --depth value: ${deepenRaw}`);
  process.exit(2);
}
if (sinceDate !== null && !/^\d{4}-\d{2}-\d{2}$/.test(sinceDate)) {
  console.error(`Invalid --since date (expected YYYY-MM-DD): ${sinceDate}`);
  process.exit(2);
}

function readText(p) {
  return readFileSync(p, 'utf8').replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
}

async function git(cwd, gitArgs, timeout = 120000) {
  const { stdout } = await execFileAsync('git', ['-C', cwd, ...gitArgs], {
    encoding: 'utf8',
    timeout,
    maxBuffer: 10 * 1024 * 1024,
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
  });
  return stdout.trim();
}

async function gitSafe(cwd, gitArgs, timeout = 10000) {
  try {
    return await git(cwd, gitArgs, timeout);
  } catch {
    return null;
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
  await Promise.all(Array.from({ length: Math.min(maxConcurrency, items.length) }, () => next()));
  return results;
}

function readExistingLock() {
  if (!existsSync(lockPath)) return null;
  try {
    return JSON.parse(readText(lockPath));
  } catch (err) {
    console.error(`Failed to parse ${lockPath}: ${err.message}`);
    process.exit(1);
  }
}

function parseChangelogRelease(pkgDir) {
  const changelogPath = join(pkgDir, 'CHANGELOG.md');
  if (!existsSync(changelogPath)) return null;
  const text = readText(changelogPath);
  for (const m of text.matchAll(/^##\s+([^\r\n]+)/gm)) {
    const heading = m[1].trim();
    if (/under development/i.test(heading)) continue;
    const ver = heading.match(/^(\d+\.\d+\.\d+(?:-[A-Za-z0-9.]+)?)\b/);
    if (ver) return ver[1];
  }
  return null;
}

function listLocalDirs() {
  if (!existsSync(referencesDir)) return [];
  return readdirSync(referencesDir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();
}

function matchesFilter(pkgOrDir) {
  if (pkgFilters.size === 0) return true;
  const dir = pkgOrDir.replace(/^yiisoft\//, '').toLowerCase();
  return pkgFilters.has(dir);
}

async function inspectLocalPackage(dir, prevEntry = null) {
  const pkgDir = join(referencesDir, dir);
  const composerPath = join(pkgDir, 'composer.json');
  if (!existsSync(composerPath) || !existsSync(join(pkgDir, '.git'))) return null;

  let pkgName = `yiisoft/${dir}`;
  try {
    const composer = JSON.parse(readText(composerPath));
    if (typeof composer?.name === 'string' && composer.name.trim() !== '') {
      pkgName = composer.name.trim();
    }
  } catch {
    // Keep fallback name
  }

  const showOut = await gitSafe(pkgDir, ['show', '-s', '--format=%H%n%cI', 'HEAD']);
  const [commit = null, commitDate = null] = showOut ? showOut.split(/\r?\n/) : [];
  let branch = await gitSafe(pkgDir, ['rev-parse', '--abbrev-ref', 'HEAD']);
  if (!branch || branch === 'HEAD') {
    const sym = await gitSafe(pkgDir, ['symbolic-ref', '--short', 'refs/remotes/origin/HEAD']);
    branch = sym ? sym.replace(/^origin\//, '') : (prevEntry?.branch || 'master');
  }
  const tag = await gitSafe(pkgDir, ['describe', '--tags', '--abbrev=0']);
  const remote = (await gitSafe(pkgDir, ['remote', 'get-url', 'origin'])) || prevEntry?.remote || `https://github.com/${pkgName}.git`;
  const release = parseChangelogRelease(pkgDir);

  return {
    package: pkgName,
    dir,
    remote,
    branch,
    commit,
    commit_date: commitDate,
    tag: tag || null,
    release,
  };
}

async function cmdLock() {
  const dirs = listLocalDirs();
  if (dirs.length === 0) {
    console.error('No package clones found in references/.');
    process.exit(1);
  }
  const existing = readExistingLock();
  const prevByDir = new Map(
    Object.entries(existing?.packages || {}).map(([key, info]) => [info.dir || key, { dir: info.dir || key, ...info }]),
  );

  const inspected = (await runPool(dirs, concurrency, (d) => inspectLocalPackage(d, prevByDir.get(d)))).filter(Boolean);
  inspected.sort((a, b) => a.dir.localeCompare(b.dir));

  const packages = {};
  for (const item of inspected) {
    packages[item.dir] = {
      package: item.package,
      remote: item.remote,
      branch: item.branch,
      commit: item.commit,
      commit_date: item.commit_date,
      tag: item.tag,
      release: item.release,
    };
  }

  const payload = {
    schema_version: 1,
    generated_at: new Date().toISOString(),
    packages_count: inspected.length,
    packages,
  };
  mkdirSync(referencesDir, { recursive: true });
  writeFileSync(lockPath, `${JSON.stringify(payload, null, 2)}\n`);
  const withTags = inspected.filter((p) => p.tag !== null).length;
  const withRelease = inspected.filter((p) => p.release !== null).length;
  console.log(
    `[sync-references] locked ${inspected.length} packages to references/packages.lock.json (git tags: ${withTags}, changelog releases: ${withRelease})`,
  );
}

function getLockEntries() {
  const lock = readExistingLock();
  if (!lock || !lock.packages || typeof lock.packages !== 'object') {
    console.error(`Missing or invalid ${lockPath}. Run: node scripts/sync-references.mjs lock`);
    process.exit(1);
  }
  return Object.entries(lock.packages)
    .map(([key, info]) => ({ dir: info.dir || key, package: info.package || `yiisoft/${key}`, ...info }))
    .filter((entry) => matchesFilter(entry.dir) || matchesFilter(entry.package));
}

async function cmdStatus() {
  const entries = getLockEntries();
  const lockAllDirs = new Set(Object.entries(readExistingLock().packages).map(([key, p]) => p.dir || key));
  const ok = [];
  const drifted = [];
  const missing = [];
  const shallow = [];

  await runPool(entries, concurrency, async (entry) => {
    const pkgDir = join(referencesDir, entry.dir);
    if (!existsSync(join(pkgDir, '.git'))) {
      missing.push(entry);
      return;
    }
    const head = await gitSafe(pkgDir, ['rev-parse', 'HEAD']);
    if (existsSync(join(pkgDir, '.git', 'shallow'))) shallow.push(entry.dir);
    if (head !== entry.commit) {
      drifted.push({ ...entry, localHead: head });
    } else {
      ok.push(entry);
    }
  });

  const extra = pkgFilters.size === 0 ? listLocalDirs().filter((d) => !lockAllDirs.has(d)) : [];

  console.log(
    `references/ status: ${ok.length}/${entries.length} pinned (${drifted.length} drifted, ${missing.length} missing, ${shallow.length} shallow, ${extra.length} unlocked)`,
  );
  for (const m of missing) console.log(`  [MISSING] ${m.package} -> references/${m.dir} (expected ${m.commit.slice(0, 8)})`);
  for (const d of drifted) {
    console.log(`  [DRIFT]   ${d.package}: locked=${d.commit.slice(0, 8)} local=${(d.localHead || 'none').slice(0, 8)}`);
  }
  for (const e of extra) console.log(`  [EXTRA]   references/${e} (not in packages.lock.json)`);

  process.exit(drifted.length > 0 || missing.length > 0 ? 1 : 0);
}

async function ensureCommitPresent(pkgDir, entry) {
  const hasCommit = await gitSafe(pkgDir, ['cat-file', '-e', `${entry.commit}^{commit}`]);
  if (hasCommit !== null) return;
  await git(pkgDir, ['fetch', '--depth', '1', 'origin', entry.commit]);
}

async function cmdRestore() {
  const entries = getLockEntries();
  if (entries.length === 0) {
    console.error('No matching packages in packages.lock.json.');
    process.exit(1);
  }
  mkdirSync(referencesDir, { recursive: true });
  let cloned = 0;
  let aligned = 0;
  let unchanged = 0;
  const failed = [];

  await runPool(entries, concurrency, async (entry) => {
    const pkgDir = join(referencesDir, entry.dir);
    try {
      if (!existsSync(join(pkgDir, '.git'))) {
        await execFileAsync(
          'git',
          ['clone', '--depth', '1', '--single-branch', '--branch', entry.branch, entry.remote, pkgDir],
          { encoding: 'utf8', timeout: 120000, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } },
        );
        const head = await gitSafe(pkgDir, ['rev-parse', 'HEAD']);
        if (head !== entry.commit) {
          await ensureCommitPresent(pkgDir, entry);
          await git(pkgDir, ['checkout', '-B', entry.branch, entry.commit]);
        }
        cloned++;
        return;
      }

      const head = await gitSafe(pkgDir, ['rev-parse', 'HEAD']);
      if (head === entry.commit) {
        unchanged++;
        return;
      }

      const dirty = await gitSafe(pkgDir, ['status', '--porcelain']);
      if (dirty && !force) {
        throw new Error(`working tree has local changes (pass --force to discard)`);
      }

      await ensureCommitPresent(pkgDir, entry);
      await git(pkgDir, ['checkout', ...(force ? ['--force'] : []), '-B', entry.branch, entry.commit]);
      aligned++;
    } catch (err) {
      failed.push({ package: entry.package, error: err.message.split(/\r?\n/)[0] });
    }
  });

  console.log(
    `[sync-references] restore: ${unchanged} already pinned, ${aligned} aligned, ${cloned} cloned, ${failed.length} failed`,
  );
  for (const f of failed) console.error(`  [FAIL] ${f.package}: ${f.error}`);
  process.exit(failed.length > 0 ? 1 : 0);
}

async function cmdFetchHistory() {
  const entries = getLockEntries();
  if (entries.length === 0) {
    console.error('No matching packages in packages.lock.json.');
    process.exit(1);
  }
  let fetched = 0;
  let withUpdates = 0;
  const failed = [];

  await runPool(entries, concurrency, async (entry) => {
    const pkgDir = join(referencesDir, entry.dir);
    if (!existsSync(join(pkgDir, '.git'))) {
      failed.push({ package: entry.package, error: 'not cloned locally (run restore first)' });
      return;
    }
    try {
      const isShallow = existsSync(join(pkgDir, '.git', 'shallow'));
      if (sinceDate !== null) {
        await git(pkgDir, ['fetch', `--shallow-since=${sinceDate}`, '--tags', 'origin', entry.branch]);
      } else if (deepenRaw !== null) {
        if (isShallow) {
          await git(pkgDir, ['fetch', `--deepen=${deepenRaw}`, '--tags', 'origin', entry.branch]);
        } else {
          await git(pkgDir, ['fetch', '--tags', 'origin', entry.branch]);
        }
      } else if (isShallow) {
        await git(pkgDir, ['fetch', '--unshallow', '--tags', 'origin', entry.branch]);
      } else {
        await git(pkgDir, ['fetch', '--tags', 'origin', entry.branch]);
      }
      fetched++;

      const ahead = await gitSafe(pkgDir, ['rev-list', '--count', `HEAD..origin/${entry.branch}`]);
      if (ahead && Number.parseInt(ahead, 10) > 0) withUpdates++;
    } catch (err) {
      failed.push({ package: entry.package, error: err.message.split(/\r?\n/)[0] });
    }
  });

  console.log(
    `[sync-references] fetch-history: ${fetched}/${entries.length} fetched (HEAD untouched), ${withUpdates} have newer commits on origin, ${failed.length} failed`,
  );
  for (const f of failed) console.error(`  [FAIL] ${f.package}: ${f.error}`);
  process.exit(failed.length > 0 ? 1 : 0);
}

async function cmdDiff() {
  const entries = getLockEntries();
  let updatedCount = 0;
  let missingCount = 0;

  for (const entry of entries) {
    const pkgDir = join(referencesDir, entry.dir);
    if (!existsSync(join(pkgDir, '.git'))) {
      missingCount++;
      continue;
    }
    const remoteRef = `origin/${entry.branch}`;
    const countRaw = await gitSafe(pkgDir, ['rev-list', '--count', `HEAD..${remoteRef}`]);
    const count = countRaw ? Number.parseInt(countRaw, 10) : 0;
    if (count === 0) continue;

    updatedCount++;
    const localTag = (await gitSafe(pkgDir, ['describe', '--tags', '--abbrev=0', 'HEAD'])) || 'no-tag';
    const remoteTag = (await gitSafe(pkgDir, ['describe', '--tags', '--abbrev=0', remoteRef])) || 'no-tag';
    console.log(`\n=== ${entry.package} (+${count} commit(s): ${localTag} -> ${remoteTag}) ===`);
    const logOut = await gitSafe(pkgDir, ['log', '--oneline', `HEAD..${remoteRef}`]);
    if (logOut) console.log(logOut);
    if (showStat) {
      const statOut = await gitSafe(pkgDir, ['diff', '--stat', `HEAD..${remoteRef}`, '--', 'src/', 'CHANGELOG.md', 'composer.json']);
      if (statOut) console.log(statOut);
    }
  }

  console.log(`\n[sync-references] diff: ${updatedCount} package(s) ahead on origin/${entries[0]?.branch || 'master'} (${missingCount} missing)`);
}

async function cmdBump() {
  if (pkgFilters.size === 0 && !hasAllFlag) {
    console.error('Specify --pkg <name> (repeatable) or --all for bump.');
    process.exit(2);
  }
  const entries = getLockEntries();
  if (entries.length === 0) {
    console.error('No matching packages in packages.lock.json.');
    process.exit(1);
  }

  let bumped = 0;
  const failed = [];
  for (const entry of entries) {
    const pkgDir = join(referencesDir, entry.dir);
    if (!existsSync(join(pkgDir, '.git'))) {
      failed.push({ package: entry.package, error: 'not cloned locally' });
      continue;
    }
    try {
      const dirty = await gitSafe(pkgDir, ['status', '--porcelain']);
      if (dirty && !force) {
        throw new Error('working tree has local changes (pass --force to discard)');
      }
      const target = toRef || `origin/${entry.branch}`;
      await git(pkgDir, ['fetch', '--tags', 'origin', entry.branch]);
      await git(pkgDir, ['checkout', ...(force ? ['--force'] : []), '-B', entry.branch, target]);
      bumped++;
    } catch (err) {
      failed.push({ package: entry.package, error: err.message.split(/\r?\n/)[0] });
    }
  }

  console.log(`[sync-references] bump: ${bumped} updated, ${failed.length} failed`);
  for (const f of failed) console.error(`  [FAIL] ${f.package}: ${f.error}`);
  if (bumped > 0) await cmdLock();
  process.exit(failed.length > 0 ? 1 : 0);
}

switch (command) {
  case 'lock':
    await cmdLock();
    break;
  case 'status':
    await cmdStatus();
    break;
  case 'restore':
    await cmdRestore();
    break;
  case 'fetch-history':
    await cmdFetchHistory();
    break;
  case 'diff':
    await cmdDiff();
    break;
  case 'bump':
    await cmdBump();
    break;
}
