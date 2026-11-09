import { check, ok, fail, read, filesMatching } from '../../lib/checks.mjs';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const php = (changed) => changed.filter((c) => c.path.endsWith('.php'));
const composerFiles = (dir) => filesMatching(dir, /(^|\/)composer\.json$/);

export default [
  check('code-style-package-required', 'composer.json requires yiisoft/code-style in require-dev', ({ dir }) => {
    const hits = composerFiles(dir).filter((f) => {
      try {
        const c = JSON.parse(read(f));
        return Boolean(c['require-dev']?.['yiisoft/code-style']);
      } catch {
        return false;
      }
    });
    return hits.length ? ok(hits.join(', ')) : fail('no composer.json with yiisoft/code-style in require-dev');
  }),

  check('rector-package-required', 'composer.json requires rector/rector in require-dev', ({ dir }) => {
    const hits = composerFiles(dir).filter((f) => {
      try {
        const c = JSON.parse(read(f));
        return Boolean(c['require-dev']?.['rector/rector']);
      } catch {
        return false;
      }
    });
    return hits.length ? ok(hits.join(', ')) : fail('no composer.json with rector/rector in require-dev');
  }),

  check('no-dev-in-require', 'Linters and tooling are never placed in runtime require (core-dependency-protocol.md: require-dev only)', ({ dir }) => {
    for (const f of composerFiles(dir)) {
      try {
        const c = JSON.parse(read(f));
        const req = c['require'] || {};
        if (req['yiisoft/code-style'] || req['rector/rector']) {
          return fail(`${f}: tooling package placed in runtime require`);
        }
      } catch {}
    }
    return ok();
  }),

  check('rector-config-exists', 'rector.php configuration file exists at project root', ({ dir }) => {
    const p = join(dir, 'rector.php');
    return existsSync(p) ? ok('rector.php') : fail('rector.php not found at project root');
  }),

  check('rector-yii-set-configured', 'rector.php configures the official Yii core set (SetList::YII_CORE) from yiisoft/code-style', ({ dir }) => {
    const p = join(dir, 'rector.php');
    if (!existsSync(p)) return fail('rector.php not found');
    const t = read(p);
    return /SetList::YII_CORE\b/.test(t) || /Yiisoft\\CodeStyle\\Rector\\SetList/.test(t)
      ? ok('rector.php uses SetList::YII_CORE')
      : fail('rector.php does not reference SetList::YII_CORE from yiisoft/code-style');
  }),

  check('rector-paths-configured', 'rector.php configures source paths (src/ and tests/)', ({ dir }) => {
    const p = join(dir, 'rector.php');
    if (!existsSync(p)) return fail('rector.php not found');
    const t = read(p);
    const hasSrc = /(?:__DIR__\s*\.\s*)?['"](?:\/)?src['"]/.test(t) || /(?:withPaths|paths)\s*\(\s*\[[^\]]*src/.test(t);
    const hasTests = /(?:__DIR__\s*\.\s*)?['"](?:\/)?tests['"]/.test(t) || /(?:withPaths|paths)\s*\(\s*\[[^\]]*tests/.test(t);
    return hasSrc && hasTests
      ? ok('rector.php configures src/ and tests/ paths')
      : fail('rector.php does not target both src/ and tests/ in paths');
  }),

  check('cs-fixer-config-exists', '.php-cs-fixer.dist.php (or .php-cs-fixer.php) configuration file exists at project root', ({ dir }) => {
    for (const name of ['.php-cs-fixer.dist.php', '.php-cs-fixer.php']) {
      if (existsSync(join(dir, name))) return ok(name);
    }
    return fail('.php-cs-fixer.dist.php not found at project root');
  }),

  check('cs-fixer-yiisoft-rules', 'PHP-CS-Fixer config uses Yiisoft\\CodeStyle\\ConfigBuilder with @Yiisoft/Core and @Yiisoft/Core:risky rule sets', ({ dir }) => {
    for (const name of ['.php-cs-fixer.dist.php', '.php-cs-fixer.php']) {
      const p = join(dir, name);
      if (existsSync(p)) {
        const t = read(p);
        if (/ConfigBuilder::build\s*\(/.test(t) && /['"]@Yiisoft\/Core['"]/.test(t)) {
          return ok(`${name} uses ConfigBuilder with @Yiisoft/Core`);
        }
      }
    }
    return fail('PHP CS Fixer config does not use Yiisoft\\CodeStyle\\ConfigBuilder with @Yiisoft/Core');
  }),

  check('composer-scripts-registered', 'composer.json registers scripts for rector and cs-fix', ({ dir }) => {
    const hit = composerFiles(dir).find((f) => {
      try {
        const c = JSON.parse(read(f));
        const s = c.scripts || {};
        return Boolean(s.rector && (s['cs-fix'] || s['cs-check']));
      } catch {
        return false;
      }
    });
    return hit ? ok(hit) : fail('composer.json missing scripts for rector and cs-fix');
  }),

  check('no-yii2', 'No Yii2 constructs in changed PHP files', ({ changed }) => {
    const re = /Yii::\$app|\buse\s+yii\\|ActiveForm::begin|->getFlash\(/;
    const bad = php(changed).filter((c) => re.test(read(c.abs)));
    return bad.length ? fail(bad.map((b) => b.path).join(', ')) : ok();
  }),

  check('strict-types', 'declare(strict_types=1) in every added PHP file', ({ changed }) => {
    const bad = php(changed).filter((c) => c.added && !/declare\(strict_types=1\);/.test(read(c.abs)));
    return bad.length ? fail(bad.map((b) => b.path).join(', ')) : ok();
  }),

  check('transcript-mentions-quality', 'The transcript reports the code quality / rector / cs-fixer setup', ({ transcript }) =>
    /code-style|rector|cs-fix|php-cs-fixer/i.test(transcript)
      ? ok()
      : fail('transcript does not mention code-style, rector, or cs-fixer')),
];
