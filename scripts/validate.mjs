#!/usr/bin/env node
// Dependency-free AI Factory extension validator (Node >= 18, ESM, node:* stdlib only).
// Validates extension.json, registered SKILL.md frontmatter, reference links,
// deliverable purity, per-skill package-catalog consistency, and injection
// activation-guard sync (AGENTS.md §4.6).
// Output: error lines, WARN [validate] lines, one summary line. Exit 0/1.

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const errors = [];
const warnings = [];

function err(file, line, check, detail) {
  errors.push(`${file}:${line} — ${check} — ${detail}`);
}

function warn(file, line, check, detail) {
  warnings.push(`${file}:${line} — ${check} — ${detail}`);
}

// git core.autocrlf=true may produce CRLF working copies; normalize before
// scanning and measuring so line numbers and character counts stay stable.
function readText(absPath) {
  return readFileSync(absPath, 'utf8').replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
}

function lineOf(text, index) {
  return text.slice(0, index).split('\n').length;
}

function displayPath(absPath) {
  return relative(root, absPath).replace(/\\/g, '/');
}

function manifestLine(raw, value) {
  const idx = raw.indexOf(`"${value}"`);
  return idx === -1 ? 0 : lineOf(raw, idx);
}

// Minimal frontmatter reader for the fields this validator checks.
// Implements `>-` block-scalar folding: strip the indicator, trim each
// continuation line, join with single spaces.
function parseFrontmatter(text) {
  const block = text.match(/^---\n([\s\S]*?)\n---(?:\n|$)/);
  if (block === null) return null;
  const lines = block[1].split('\n');
  const fields = {};
  for (let i = 0; i < lines.length; i++) {
    const keyMatch = lines[i].match(/^([A-Za-z][A-Za-z0-9_-]*):(?:\s+(.*))?$/);
    if (keyMatch === null) continue;
    const key = keyMatch[1];
    let value = keyMatch[2] ?? '';
    if (/^[>|][>|+-]*\s*$/.test(value)) {
      const continuation = [];
      let j = i + 1;
      while (j < lines.length && (lines[j] === '' || /^\s/.test(lines[j]))) {
        if (lines[j].trim() !== '') continuation.push(lines[j].trim());
        j++;
      }
      value = continuation.join(' ');
      i = j - 1;
    } else {
      value = value.replace(/^["']|["']$/g, '').trim();
    }
    fields[key] = value;
  }
  return fields;
}

function walkMarkdownFiles(dir) {
  const found = [];
  for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const abs = join(dir, entry.name);
    if (entry.isDirectory()) found.push(...walkMarkdownFiles(abs));
    else if (entry.isFile() && entry.name.endsWith('.md')) found.push(abs);
  }
  return found;
}

// Each distinct violation is reported once per file, at its first occurrence.
function scanPurity(absPath, text, selfPrefix) {
  const checks = [
    {
      check: 'purity-self-path',
      pattern: null,
      literal: selfPrefix,
      detail: (m) => `self-referential install path "${m}" — use skill-relative wording`,
    },
    {
      check: 'purity-authoring-path',
      pattern: /references\/[A-Za-z0-9._-]+\/src\b/g,
      detail: (m) => `authoring-library source path "${m}" — use vendor/yiisoft/... of the installed project`,
    },
    {
      check: 'purity-windows-path',
      pattern: /[A-Za-z]:\\[^\s`'"]*\\/g,
      detail: (m) => `Windows drive path "${m}" — not portable across agent environments`,
    },
  ];
  for (const { check, pattern, literal, detail } of checks) {
    const seen = new Set();
    if (pattern === null) {
      const idx = text.indexOf(literal);
      if (idx !== -1) err(displayPath(absPath), lineOf(text, idx), check, detail(literal));
      continue;
    }
    for (const match of text.matchAll(pattern)) {
      if (seen.has(match[0])) continue;
      seen.add(match[0]);
      err(displayPath(absPath), lineOf(text, match.index), check, detail(match[0]));
    }
  }
}

// Allowlist: backticked yiisoft/... tokens that directly follow an ❌ marker
// in the catalog's phantom-guard table (multi-token rows supported).
function collectPhantomAllowlist(catalogText) {
  const allow = new Set();
  for (const line of catalogText.split('\n')) {
    if (!line.includes('❌')) continue;
    for (const segment of line.split('❌').slice(1)) {
      const cell = segment.split('|')[0];
      for (const token of cell.matchAll(/`(yiisoft\/[a-z0-9][a-z0-9._-]*)`/g)) {
        allow.add(token[1]);
      }
    }
  }
  return allow;
}

function checkCatalogConsistency(skillDir) {
  const catalogPath = join(skillDir, 'references', 'package-catalog.md');
  const guidesDir = join(skillDir, 'references');
  if (!existsSync(catalogPath)) {
    warn(displayPath(catalogPath), 0, 'catalog-consistency', 'package-catalog.md not found; consistency check skipped');
    return;
  }
  const catalogText = readText(catalogPath);
  const allow = collectPhantomAllowlist(catalogText);
  const reported = new Set();
  for (const guidePath of walkMarkdownFiles(guidesDir)) {
    const text = readText(guidePath);
    for (const token of text.matchAll(/`(yiisoft\/([a-z0-9][a-z0-9._-]*))`/g)) {
      const name = token[1];
      const pkg = token[2];
      if (pkg.includes('*') || pkg.endsWith('-')) continue; // wildcard / truncated artifacts
      if (catalogText.includes(name) || allow.has(name)) continue;
      const key = `${displayPath(guidePath)}:${name}`;
      if (reported.has(key)) continue;
      reported.add(key);
      warn(displayPath(guidePath), lineOf(text, token.index), 'catalog-consistency', `\`${name}\` is referenced but missing from package-catalog.md`);
    }
  }
}

// AGENTS.md §4.6: every injection must open with the canonical activation
// guard, byte-for-byte. The guard decides whether the skill loads at all, so
// it cannot live in a file inside the skill — the canonical prefix is held
// here, in the authoring tooling. A bare "yiisoft/* in composer.json" check
// also matches Yii 2 projects and plain Yiisoft-ecosystem libraries (e.g.
// yiisoft/di + yiisoft/strings), hence the yiisoft/yii-* discriminator.
const CANONICAL_GUARD =
  'Guard: activate this block only for a Yii 3 application — at least one `yiisoft/yii-*` package (application/runtime stack, e.g. `yiisoft/yii-runner-http`, `yiisoft/yii-runner-console`, `yiisoft/yii-http`, or `yiisoft/yii-console`; `yiisoft/yii2` excluded) in `composer.json` or `composer.lock`. Yii 2 project (`yiisoft/yii2` present), Yii-ecosystem library (only base `yiisoft/*` packages like `yiisoft/di` or `yiisoft/strings`, without application runtime stack), or non-Yii project: ignore this block and do not apply Yii 3 rules. Unknown project state (neither composer.json nor composer.lock present, contradictory evidence): do not auto-activate — ask the user or report the task blocked (`composer.json` declares intent; `composer.lock` confirms installed versions). Otherwise';

function checkInjectionGuards(manifest) {
  if (!Array.isArray(manifest?.injections)) return;
  const legacyWeakForm = /no `yiisoft\/\*` in `composer\.json`/;
  for (const injection of manifest.injections) {
    if (injection === null || typeof injection !== 'object') continue;
    if (typeof injection.file !== 'string' || injection.file.trim() === '') continue;
    const absPath = join(root, injection.file);
    if (!existsSync(absPath)) continue; // already reported by the manifest check
    const text = readText(absPath);
    const lines = text.split('\n');
    const guardLineIdx = lines.findIndex((line) => /^Guard:/.test(line));
    if (guardLineIdx === -1) {
      err(displayPath(absPath), 0, 'injection-guard', 'no "Guard:" line — every injection must open with the canonical activation guard (AGENTS.md §4.6)');
      continue;
    }
    const at = guardLineIdx + 1;
    // Position contract: the guard is the first content line of the body —
    // only the section heading and blank lines may precede it.
    const preceding = lines.slice(0, guardLineIdx).filter((line) => line.trim() !== '');
    if (preceding.some((line) => !/^##\s/.test(line))) {
      err(displayPath(absPath), at, 'injection-guard', 'activation guard position — only a section heading and blank lines may precede the "Guard:" line (AGENTS.md §4.6)');
    }
    // Byte-identity: the canonical prefix must match exactly; per-injection
    // duties continue after the shared "Otherwise".
    if (!lines[guardLineIdx].startsWith(CANONICAL_GUARD)) {
      err(displayPath(absPath), at, 'injection-guard', 'activation guard drift — the guard line must start with the CANONICAL_GUARD prefix byte-for-byte (AGENTS.md §4.6)');
    }
    if (legacyWeakForm.test(lines[guardLineIdx])) {
      err(displayPath(absPath), at, 'injection-guard', 'legacy weak guard "no `yiisoft/*` in `composer.json`" — also matches Yii 2 projects and Yiisoft-ecosystem libraries');
    }
  }
}

// GitHub-style heading slug: lowercase, strip punctuation except letters,
// digits, underscores, spaces, and hyphens, then replace spaces with hyphens.
// Handles the GitHub duplicate-suffix rule (second occurrence gets `-1`).
function githubSlugify(text) {
  return text
    .trim()
    .replace(/#+$/, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}_\s-]/gu, '')
    .replace(/\s/g, '-');
}

function collectHeadingAnchors(text) {
  const anchors = new Set();
  const seen = new Map();
  for (const match of text.matchAll(/^#{1,6}\s+(.+?)\s*$/gm)) {
    const base = githubSlugify(match[1]);
    if (base === '') continue;
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    anchors.add(n === 0 ? base : `${base}-${n}`);
  }
  return anchors;
}

// Anchor links are recognized in two forms:
//  1. markdown links: [text](file.md#anchor) / [text](references/file.md#anchor)
//  2. backticked tokens: `references/file.md#anchor`
// Targets resolve relative to the directory of the referencing file.
function checkAnchors(absPath, text, anchorsCache) {
  const dir = dirname(absPath);
  const combined = [
    ...text.matchAll(/\]\(((?:references\/)?[A-Za-z0-9][A-Za-z0-9._-]*\.md)(#[^)\s]+)\)/g),
    ...text.matchAll(/`((?:references\/)?[A-Za-z0-9][A-Za-z0-9._-]*\.md)(#[A-Za-z0-9._-]+)`/g),
  ];
  const seen = new Set();
  for (const match of combined) {
    const targetName = match[1];
    const anchor = match[2].slice(1);
    const key = `${targetName}#${anchor}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const targetPath = join(dir, targetName);
    if (!existsSync(targetPath)) {
      err(displayPath(absPath), lineOf(text, match.index), 'anchor-link', `link target "${targetName}" does not exist`);
      continue;
    }
    if (!anchorsCache.has(targetPath)) {
      anchorsCache.set(targetPath, collectHeadingAnchors(readText(targetPath)));
    }
    if (!anchorsCache.get(targetPath).has(anchor)) {
      err(displayPath(absPath), lineOf(text, match.index), 'anchor-link', `anchor "#${anchor}" does not exist in ${targetName}`);
    }
  }
}

// The `## References` section is the skill's inventory of its topic guides:
// every guide file must be listed exactly once, and every listing must be a
// single-file bullet (`- `references/<name>.md` — description`).
// May live in SKILL.md or in references/INDEX.md when progressive disclosure is enabled.
function checkSkillTextReferences(skillDir, manifest) {
  const skillMdPath = join(skillDir, 'SKILL.md');
  const skillText = readText(skillMdPath);
  const headings = [...skillText.matchAll(/^#{1,6}\s+(.+?)\s*$/gm)].map((m) => m[1].trim());

  const validSections = new Set();
  for (const h of headings) {
    validSections.add(h.toLowerCase());
    const stem = h.replace(/\s*[\(—–].*$/, '').trim().toLowerCase();
    if (stem) validSections.add(stem);
  }
  validSections.add('core rules');
  validSections.add('core rule');
  validSections.add('cross-cutting yii 2 bans');
  validSections.add('quick guard list');
  validSections.add('definition of done');
  validSections.add('chain integrity');
  validSections.add('task & intent routing matrix');
  validSections.add('task routing matrix');
  validSections.add('mission workflow');
  validSections.add('ai factory adapter');

  const filesToScan = [join(root, 'README.md')];
  if (Array.isArray(manifest?.injections)) {
    for (const inj of manifest.injections) {
      if (typeof inj?.file === 'string' && inj.file.trim() !== '') {
        filesToScan.push(join(root, inj.file));
      }
    }
  }

  for (const filePath of filesToScan) {
    if (!existsSync(filePath)) continue;
    const text = readText(filePath);

    // Pattern 1: per the <Name> in SKILL.md (only when not followed by a section name like Stage 0)
    for (const match of text.matchAll(/(?:per|in|see)\s+the\s+([A-Za-z0-9\s—–-]+?)\s+(?:in|of)\s+SKILL\.md(?!\s+[A-Za-z0-9])/g)) {
      const name = match[1].trim().toLowerCase();
      const isKnown = [...validSections].some((v) => name.includes(v) || v.includes(name));
      if (!isKnown) {
        err(displayPath(filePath), lineOf(text, match.index), 'skill-section-ref', `referenced section "${match[1].trim()}" does not exist in SKILL.md`);
      }
    }

    // Pattern 2: SKILL.md <SectionName> (e.g. SKILL.md Stage 0, SKILL.md Core rules, SKILL.md Finale)
    for (const match of text.matchAll(/SKILL\.md\s+([A-Za-z0-9]+(?:\s+[A-Za-z0-9]+)?)/g)) {
      const token = match[1].trim().toLowerCase();
      // Skip words that are not section names (e.g. "item", "and", "or", "Core rule")
      if (['item', 'and', 'or', 'row', 'checks'].includes(token.split(' ')[0])) continue;
      const isKnown = [...validSections].some((v) => token.includes(v) || v.includes(token));
      if (!isKnown) {
        err(displayPath(filePath), lineOf(text, match.index), 'skill-section-ref', `referenced section "${match[1].trim()}" does not exist in SKILL.md`);
      }
    }

    for (const match of text.matchAll(/(?:the skill's|its)\s+"([^"]+)"\s*(?:section|—)/g)) {
      const name = match[1].trim().toLowerCase();
      const isKnown = [...validSections].some((v) => name.includes(v) || v.includes(name));
      if (!isKnown) {
        err(displayPath(filePath), lineOf(text, match.index), 'skill-section-ref', `quoted section "${match[1].trim()}" does not exist in SKILL.md`);
      }
    }

    for (const match of text.matchAll(/SKILL\.md\s+"([^"]+)"/g)) {
      const name = match[1].trim().toLowerCase();
      const isKnown = [...validSections].some((v) => name.includes(v) || v.includes(name));
      if (!isKnown) {
        err(displayPath(filePath), lineOf(text, match.index), 'skill-section-ref', `quoted section "${match[1].trim()}" does not exist in SKILL.md`);
      }
    }
  }
}

function checkReferencesInventory(skillDir, skillMdPath, text) {
  const indexMdPath = join(skillDir, 'references', 'INDEX.md');
  const hasIndexMd = existsSync(indexMdPath);
  const targetPath = hasIndexMd ? indexMdPath : skillMdPath;
  const targetText = hasIndexMd ? readText(indexMdPath) : text;

  const lines = targetText.split('\n');
  const start = lines.findIndex((line) => /^##\s+References\b/.test(line));
  if (start === -1) {
    err(displayPath(targetPath), 0, 'references-inventory', 'no "## References" section found');
    return;
  }
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^##\s+/.test(lines[i])) {
      end = i;
      break;
    }
  }
  const sectionLines = lines.slice(start, end);
  const sectionText = sectionLines.join('\n');

  const guidesDir = join(skillDir, 'references');
  if (!existsSync(guidesDir)) {
    err(displayPath(targetPath), lineOf(targetText, 0), 'references-inventory', 'references/ directory not found');
    return;
  }
  const bulletPattern = /^- `(?:references\/)?([A-Za-z0-9][A-Za-z0-9._-]*\.md)` — /;
  const tokenPattern = /`(?:references\/)?([A-Za-z0-9][A-Za-z0-9._-]*\.md)`/g;
  const mentioned = new Set();
  for (let i = 0; i < sectionLines.length; i++) {
    const line = sectionLines[i];
    if (!/\.md/.test(line)) continue;
    if (/^#{1,6}\s+/.test(line) || /^\s*$/.test(line)) continue;
    if (!bulletPattern.test(line)) {
      err(displayPath(targetPath), start + i + 1, 'references-bullet-format', `listing lines in "## References" must match "- \`references/<name>.md\` — description" (got: ${line.slice(0, 90)})`);
    }
    const tokens = [...line.matchAll(tokenPattern)];
    if (tokens.length !== 1) {
      err(displayPath(targetPath), start + i + 1, 'references-bullet-format', `listing lines in "## References" must name exactly one guide file (found ${tokens.length})`);
    }
    for (const token of tokens) {
      const name = token[1].replace(/^references\//, '');
      mentioned.add(name);
    }
  }
  for (const absPath of walkMarkdownFiles(guidesDir)) {
    const name = displayPath(absPath).split('/').pop();
    if (name === 'INDEX.md') continue;
    if (mentioned.has(name)) {
      const occurrences = [...sectionText.matchAll(new RegExp(`(?<![A-Za-z0-9._-])${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![A-Za-z0-9._-])`, 'g'))].length;
      if (occurrences !== 1) {
        err(displayPath(targetPath), start + 1, 'references-inventory', `references/${name} is mentioned ${occurrences} times in the References section (must be exactly once)`);
      }
      mentioned.delete(name);
    } else {
      err(displayPath(targetPath), start + 1, 'references-inventory', `references/${name} is not listed in the References section`);
    }
  }
  for (const name of mentioned) {
    err(displayPath(targetPath), start + 1, 'references-inventory', `References section lists "${name}" but references/${name} does not exist`);
  }
}

function checkSkill(skillEntry) {
  const skillDir = join(root, skillEntry);
  const skillMdPath = join(skillDir, 'SKILL.md');
  const text = readText(skillMdPath);
  const anchorsCache = new Map();

  const fields = parseFrontmatter(text);
  if (fields === null) {
    err(displayPath(skillMdPath), 1, 'frontmatter', 'no --- frontmatter block');
  } else {
    if (!fields.name || fields.name.trim() === '') {
      err(displayPath(skillMdPath), 1, 'frontmatter', 'frontmatter "name" is missing or empty');
    }
    if (!fields.description || fields.description.trim() === '') {
      err(displayPath(skillMdPath), 1, 'frontmatter', 'frontmatter "description" is missing or empty');
    } else if (fields.description.length > 1024) {
      err(displayPath(skillMdPath), 1, 'frontmatter', `folded description is ${fields.description.length} characters (max 1024)`);
    }
  }

  // AGENTS.md §4.6: the skill entry point must carry the applicability guard.
  const applicabilityIdx = text.indexOf('Applicability guard:');
  const applicability = applicabilityIdx === -1 ? '' : text.slice(applicabilityIdx, applicabilityIdx + 900);
  if (!/`yiisoft\/yii-\*` package/.test(applicability) || !/`yiisoft\/yii2` excluded/.test(applicability) || !/Unknown project state/.test(applicability)) {
    err(displayPath(skillMdPath), 1, 'activation-guard', 'Stage 0 lacks the applicability guard (yiisoft/yii-* discriminator, yii2 exclusion, unknown-state escalation — AGENTS.md §4.6)');
  }

  const mentioned = new Set();
  for (const match of text.matchAll(/references\/([A-Za-z0-9][A-Za-z0-9._-]*\.md)/g)) {
    const name = match[1];
    if (mentioned.has(name)) continue;
    mentioned.add(name);
    if (!existsSync(join(skillDir, 'references', name))) {
      err(displayPath(skillMdPath), lineOf(text, match.index), 'reference-link', `references/${name} does not exist`);
    }
  }

  for (const mdPath of walkMarkdownFiles(skillDir)) {
    const mdText = readText(mdPath);
    scanPurity(mdPath, mdText, `${skillEntry.replace(/\\/g, '/')}/`);
    checkAnchors(mdPath, mdText, anchorsCache);
  }

  checkReferencesInventory(skillDir, skillMdPath, text);
  checkCatalogConsistency(skillDir);
}

function main() {
  const manifestPath = join(root, 'extension.json');
  let manifest = null;
  if (!existsSync(manifestPath)) {
    err('extension.json', 0, 'manifest', 'file not found');
  } else {
    const raw = readText(manifestPath);
    try {
      manifest = JSON.parse(raw);
    } catch (parseError) {
      err('extension.json', 0, 'manifest', `JSON parse error: ${parseError.message}`);
    }
    if (manifest !== null) {
      if (typeof manifest.name !== 'string' || manifest.name.trim() === '') {
        err('extension.json', 0, 'manifest', '"name" must be a non-empty string');
      }
      if (typeof manifest.version !== 'string' || !/^\d+\.\d+\.\d+$/.test(manifest.version)) {
        err('extension.json', manifestLine(raw, manifest?.version ?? ''), 'manifest', `"version" must match ^\\d+\\.\\d+\\.\\d+$ (got ${JSON.stringify(manifest?.version ?? undefined)})`);
      }
      if (typeof manifest.description !== 'string' || manifest.description.trim() === '') {
        err('extension.json', 0, 'manifest', '"description" must be a non-empty string');
      }
      if (!Array.isArray(manifest.injections) || manifest.injections.length === 0) {
        err('extension.json', 0, 'manifest', '"injections" must be a non-empty array');
      } else {
        for (const injection of manifest.injections) {
          const line = manifestLine(raw, injection?.file ?? '');
          if (injection === null || typeof injection !== 'object') {
            err('extension.json', line, 'manifest', 'injection entry must be an object');
            continue;
          }
          for (const field of ['target', 'position', 'file']) {
            if (typeof injection[field] !== 'string' || injection[field].trim() === '') {
              err('extension.json', line, 'manifest', `injection "${injection.target ?? '?'}" field "${field}" must be a non-empty string`);
            }
          }
          if (typeof injection.file === 'string' && injection.file.trim() !== '' && !existsSync(join(root, injection.file))) {
            err('extension.json', line, 'manifest', `injection file "${injection.file}" does not resolve`);
          }
        }
      }
      if (!Array.isArray(manifest.skills) || manifest.skills.length === 0) {
        err('extension.json', 0, 'manifest', '"skills" must be a non-empty array');
      } else {
        for (const skillEntry of manifest.skills) {
          if (typeof skillEntry !== 'string' || skillEntry.trim() === '') {
            err('extension.json', 0, 'manifest', 'skill entry must be a non-empty string');
            continue;
          }
          const skillDir = join(root, skillEntry);
          if (!existsSync(skillDir) || !statSync(skillDir).isDirectory()) {
            err('extension.json', manifestLine(raw, skillEntry), 'manifest', `skill directory "${skillEntry}" does not exist`);
          } else if (!existsSync(join(skillDir, 'SKILL.md'))) {
            err('extension.json', manifestLine(raw, skillEntry), 'manifest', `skill "${skillEntry}" has no SKILL.md`);
          } else {
            checkSkill(skillEntry);
          }
        }
      }

      checkInjectionGuards(manifest);
      if (Array.isArray(manifest.skills) && manifest.skills[0]) {
        checkSkillTextReferences(join(root, manifest.skills[0]), manifest);
      }
    }
  }

  if (errors.length > 0) {
    for (const line of errors) console.log(line);
    for (const line of warnings) console.log(`WARN [validate] ${line}`);
    console.log(`validate: FAILED (${errors.length} errors, ${warnings.length} warnings)`);
    process.exit(1);
  }

  for (const line of warnings) console.log(`WARN [validate] ${line}`);
  const skillCount = Array.isArray(manifest?.skills) ? manifest.skills.length : 0;
  const injectionCount = Array.isArray(manifest?.injections) ? manifest.injections.length : 0;
  console.log(`validate: ok (${skillCount} skills, ${injectionCount} injections, ${warnings.length} warnings)`);
  process.exit(0);
}

main();
