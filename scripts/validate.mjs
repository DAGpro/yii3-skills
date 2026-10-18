#!/usr/bin/env node
// Dev tool: validates the extension and (re)generates references/package-catalog.md.   node scripts/validate.mjs [--gen]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const errors = [];
const err = (m) => errors.push(m);
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const KNOWN = ['aif', 'aif-plan', 'aif-improve', 'aif-implement', 'aif-verify', 'aif-fix', 'aif-review', 'aif-commit', 'aif-docs', 'aif-ci', 'aif-rules-check', 'aif-security-checklist'];

const man = JSON.parse(read('extension.json'));
if (!man.name || !man.version) err('manifest: name/version required');
for (const inj of man.injections ?? []) {
  if (!fs.existsSync(path.join(root, inj.file))) err(`injection file missing: ${inj.file}`);
  if (!['append', 'prepend'].includes(inj.position)) err(`bad position: ${inj.file}`);
  if (!KNOWN.includes(inj.target)) err(`unknown injection target (check spelling): ${inj.target}`);
}
for (const s of man.skills ?? []) {
  const f = path.join(s, 'SKILL.md');
  if (!fs.existsSync(path.join(root, f))) { err(`skill missing SKILL.md: ${s}`); continue; }
  const fm = read(f).match(/^---\n([\s\S]*?)\n---/);
  if (!fm || !/name:\s*\S/.test(fm[1]) || !/description:/.test(fm[1])) err(`SKILL.md frontmatter needs name+description: ${s}`);
}
const catFile = 'skills/yii3/scripts/package-catalog.json';
const cat = JSON.parse(read(catFile));
let md = '# Yii3 package catalog\n\n> Generated from `scripts/package-catalog.json` (`node scripts/validate.mjs --gen`). **verified** = package exists (seen on Packagist/yiisoft demo), NOT that its API is known. **unverified** = from memory: confirm with `composer show -a <pkg>` first.\n\n| Key | Need | Packages | Choose one of | Exists | Notes |\n|---|---|---|---|---|---|\n';
for (const [k, e] of Object.entries(cat)) {
  if (k === '_meta') continue;
  if (!Array.isArray(e.packages) || !e.packages.length) err(`catalog ${k}: packages`);
  if (!['verified', 'unverified'].includes(e.exists)) err(`catalog ${k}: exists must be verified|unverified`);
  for (const p of [...e.packages, ...(e.chooseOne ?? [])]) if (!/^[a-z0-9-]+\/[a-z0-9._-]+$/.test(p)) err(`catalog ${k}: bad package name ${p}`);
  md += `| ${k} | ${e.title}${e.dev ? ' (dev)' : ''} | ${e.packages.map((p) => `\`${p}\``).join(', ')} | ${(e.chooseOne ?? []).map((p) => `\`${p}\``).join(', ')} | ${e.exists} | ${e.note ?? ''} |\n`;
}
const mdPath = 'skills/yii3/references/package-catalog.md';
if (process.argv.includes('--gen')) fs.writeFileSync(path.join(root, mdPath), md);
else if (read(mdPath) !== md) err(`${mdPath} is out of date: run node scripts/validate.mjs --gen`);

if (errors.length) { console.error(errors.map((e) => '✗ ' + e).join('\n')); process.exit(1); }
console.log(`✓ extension valid (${(man.injections ?? []).length} injections, ${Object.keys(cat).length - 1} capabilities)`);
