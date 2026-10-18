#!/usr/bin/env node
// Deterministic Yii3 project probe for the `yii3` skill. No dependencies. Prints JSON.
//   --root <dir>            project root (default: cwd; also looks one level down for composer.json)
//   --need a,b,c            capability keys from package-catalog.json (use --list for all)
//   --scan f1.php f2.php    check imports/Yii2 usage/strict_types in the given files
//   --scan-git [baseRef]    same, for files changed in the working tree (and baseRef...HEAD)
//   --list                  list capability keys
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const here = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(n); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d; };
const has = (n) => argv.includes(n);
const multi = (n) => { const i = argv.indexOf(n); if (i < 0) return []; const out = []; for (let j = i + 1; j < argv.length && !argv[j].startsWith('--'); j++) out.push(argv[j]); return out; };
const readJson = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };
const exists = (f) => fs.existsSync(f);
const isYii2Name = (k) => k === 'yiisoft/yii2' || k.startsWith('yiisoft/yii2-');

const catalog = readJson(opt('--catalog', path.join(here, 'package-catalog.json'))) ?? {};
if (has('--list')) { console.log(JSON.stringify(Object.keys(catalog).filter((k) => k !== '_meta'))); process.exit(0); }

function classify(dir) {
  const c = readJson(path.join(dir, 'composer.json'));
  if (!c) return null;
  const req = { ...(c.require ?? {}), ...(c['require-dev'] ?? {}) };
  const names = Object.keys(req);
  const yii2 = names.some(isYii2Name);
  const yii3 = names.filter((k) => k.startsWith('yiisoft/') && !isYii2Name(k));
  const core = ['yiisoft/config', 'yiisoft/di', 'yiisoft/yii-http', 'yiisoft/yii-console', 'yiisoft/router'];
  const plugin = !!c.extra?.['config-plugin'];
  const isYii3 = !yii2 && yii3.length > 0 && (plugin || yii3.some((k) => core.includes(k)));
  return { dir, c, req, yii2, yii3, plugin, isYii3 };
}

let start = path.resolve(opt('--root', process.cwd()));
const cands = [start];
try { for (const e of fs.readdirSync(start, { withFileTypes: true })) if (e.isDirectory() && !['vendor', 'node_modules', '.git'].includes(e.name)) cands.push(path.join(start, e.name)); } catch {}
const infos = cands.map(classify).filter(Boolean);
const info = infos.find((i) => i.isYii3) ?? infos[0];

if (!info) { console.log(JSON.stringify({ yii3: false, reason: 'composer.json not found', root: start })); process.exit(0); }
const root = info.dir;
const lock = readJson(path.join(root, 'composer.lock'));
const locked = new Map();
for (const p of [...(lock?.packages ?? []), ...(lock?.['packages-dev'] ?? [])]) locked.set(p.name, p);

const out = {
  yii3: info.isYii3,
  root,
  yii2Detected: info.yii2,
  php: info.req.php ?? null,
  evidence: info.yii3.slice(0, 8).concat(info.plugin ? ['extra.config-plugin'] : []),
};

if (info.isYii3) {
  out.packages = info.yii3.map((n) => ({ name: n, constraint: info.req[n], locked: locked.get(n)?.version ?? null, vendor: exists(path.join(root, 'vendor', n)) }));
  out.config = {
    dir: exists(path.join(root, 'config')),
    mergePlan: exists(path.join(root, 'config/.merge-plan.php')),
    groups: info.c.extra?.['config-plugin'] ? Object.keys(info.c.extra['config-plugin']) : [],
  };
  out.tooling = {
    composerScripts: Object.keys(info.c.scripts ?? {}),
    makefile: exists(path.join(root, 'Makefile')),
    docker: ['compose.yml', 'compose.yaml', 'docker-compose.yml', 'docker-compose.yaml'].some((f) => exists(path.join(root, f))),
    psalm: exists(path.join(root, 'psalm.xml')) || exists(path.join(root, 'psalm.xml.dist')),
    phpstan: exists(path.join(root, 'phpstan.neon')) || exists(path.join(root, 'phpstan.neon.dist')),
    rector: exists(path.join(root, 'rector.php')),
    phpunit: exists(path.join(root, 'phpunit.xml')) || exists(path.join(root, 'phpunit.xml.dist')),
  };

  // ---- architecture source ----
  let archRel = '.ai-factory/ARCHITECTURE.md';
  const cfg = path.join(root, '.ai-factory/config.yaml');
  if (exists(cfg)) {
    let inPaths = false;
    for (const l of fs.readFileSync(cfg, 'utf8').split('\n')) {
      if (/^paths:\s*(#.*)?$/.test(l)) { inPaths = true; continue; }
      if (inPaths && /^\S/.test(l) && !l.startsWith('#')) inPaths = false;
      const m = inPaths && l.match(/^\s+architecture:\s*["']?([^"'#\s]+)/);
      if (m) { archRel = m[1]; break; }
    }
  }
  const archExists = exists(path.join(root, archRel));
  out.architecture = { path: archRel, exists: archExists, source: archExists ? 'artifact' : 'inferred' };
  if (!archExists) {
    const tree = (d, depth) => {
      if (depth < 0 || !exists(d)) return null;
      const r = {};
      for (const e of fs.readdirSync(d, { withFileTypes: true })) if (e.isDirectory() && !e.name.startsWith('.')) r[e.name] = tree(path.join(d, e.name), depth - 1);
      return r;
    };
    out.architecture.layout = { src: tree(path.join(root, 'src'), 2), config: tree(path.join(root, 'config'), 1) };
  }

  // ---- capabilities ----
  const need = (opt('--need', '') || '').split(',').map((s) => s.trim()).filter(Boolean);
  const have = (n) => info.req[n] !== undefined || locked.has(n);
  out.needs = need.map((key) => {
    const e = catalog[key];
    if (!e || key === '_meta') return { key, error: 'unknown capability', hint: 'run --list or search Packagist before writing custom code' };
    // a single-element chooseOne is really a required companion
    const required = e.chooseOne?.length === 1 ? [...e.packages, ...e.chooseOne] : e.packages;
    const missing = required.filter((p) => !have(p));
    const choice = e.chooseOne && e.chooseOne.length > 1 ? { options: e.chooseOne, satisfied: e.chooseOne.filter(have) } : null;
    const r = { key, title: e.title, exists: e.exists, installed: required.filter(have), missing, note: e.note ?? null };
    if (choice) r.choice = choice;
    if (missing.length) r.composer = `composer require ${missing.join(' ')}${e.dev ? ' --dev' : ''}`;
    if (choice && choice.satisfied.length === 0) r.action = 'choose ONE of choice.options matching the project (inspect env/docker/existing code); ask if unclear';
    if (e.exists !== 'verified' || (e.unverifiedPackages ?? []).some((p) => missing.includes(p))) r.warning = 'package name not verified: run `composer show -a <pkg>` / `composer require --dry-run` first';
    return r;
  });

  // ---- scan ----
  let files = multi('--scan').map((f) => path.resolve(process.cwd(), f));
  if (has('--scan-git')) {
    const base = opt('--scan-git', null);
    const git = (a) => { try { return execFileSync('git', a, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).split('\n').filter(Boolean); } catch { return []; } };
    files = [...new Set([...git(['diff', '--name-only', 'HEAD']), ...git(['ls-files', '--others', '--exclude-standard']), ...(base ? git(['diff', '--name-only', `${base}...HEAD`]) : [])])]
      .filter((f) => f.endsWith('.php')).map((f) => path.join(root, f));
  }
  if (files.length || has('--scan') || has('--scan-git')) {
    const ns = [];
    for (const [name, p] of locked) for (const [prefix] of Object.entries(p.autoload?.['psr-4'] ?? {})) ns.push([prefix, name]);
    for (const [prefix] of Object.entries(info.c.autoload?.['psr-4'] ?? {})) ns.push([prefix, '(project)']);
    ns.sort((a, b) => b[0].length - a[0].length);
    const findings = [];
    for (const f0 of files) {
      const f = path.resolve(root, f0);
      if (!exists(f)) continue;
      const rel = path.relative(root, f);
      const src = fs.readFileSync(f, 'utf8');
      if (!/declare\s*\(\s*strict_types\s*=\s*1\s*\)/.test(src)) findings.push({ file: rel, type: 'missing-strict-types' });
      src.split('\n').forEach((line, i) => {
        if (/\bYii::\$?\w|^\s*use\s+yii\\/.test(line)) findings.push({ file: rel, line: i + 1, type: 'yii2-api', text: line.trim().slice(0, 100) });
        const m = line.match(/^\s*use\s+(?:function\s+|const\s+)?(Yiisoft\\[A-Za-z0-9_\\]+?)(?:\\\{|\s+as\s|;|\s*$)/);
        if (!m) return;
        const imp = m[1] + '\\';
        const hit = ns.find(([prefix]) => imp.startsWith(prefix));
        if (!hit) findings.push({ file: rel, line: i + 1, type: 'unknown-yiisoft-namespace', namespace: m[1], hint: 'no installed package provides it (check composer.lock / run composer require)' });
        else if (hit[1] !== '(project)' && info.req[hit[1]] === undefined) findings.push({ file: rel, line: i + 1, type: 'transitive-dependency', package: hit[1], hint: 'used directly but not required in composer.json' });
      });
    }
    out.scan = { files: files.map((f) => path.relative(root, path.resolve(root, f))), findings };
  }
}
console.log(JSON.stringify(out, null, 2));
