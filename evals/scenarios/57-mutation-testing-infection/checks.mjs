import { check, ok, fail, read, filesMatching } from '../../lib/checks.mjs';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const php = (changed) => changed.filter((c) => c.path.endsWith('.php'));
const composerFiles = (dir) => filesMatching(dir, /(^|\/)composer\.json$/);

const parseJsonOrJson5 = (text) => {
  try {
    return JSON.parse(text);
  } catch {
    try {
      const stripped = text
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/[^\n\r]*/g, '')
        .replace(/,\s*([\]}])/g, '$1');
      return JSON.parse(stripped);
    } catch {
      return null;
    }
  }
};

const findInfectionConfig = (dir) => {
  for (const name of ['infection.json.dist', 'infection.json5.dist', 'infection.json', 'infection.json5']) {
    const p = join(dir, name);
    if (existsSync(p)) {
      return { name, path: p, data: parseJsonOrJson5(read(p)) };
    }
  }
  return null;
};

export default [
  check('infection-package-required', 'composer.json requires infection/infection in require-dev', ({ dir }) => {
    const hits = composerFiles(dir).filter((f) => {
      try {
        const c = JSON.parse(read(f));
        return Boolean(c['require-dev']?.['infection/infection']);
      } catch {
        return false;
      }
    });
    return hits.length ? ok(hits.join(', ')) : fail('no composer.json with infection/infection in require-dev');
  }),

  check('plugin-package-required', 'composer.json requires roave/infection-static-analysis-plugin in require-dev (testing-infection.md §1.2)', ({ dir }) => {
    const hits = composerFiles(dir).filter((f) => {
      try {
        const c = JSON.parse(read(f));
        return Boolean(c['require-dev']?.['roave/infection-static-analysis-plugin']);
      } catch {
        return false;
      }
    });
    return hits.length ? ok(hits.join(', ')) : fail('no composer.json with roave/infection-static-analysis-plugin in require-dev');
  }),

  check('no-dev-in-require', 'Testing tools and plugins are never placed in runtime require (core-dependency-protocol.md: require-dev only)', ({ dir }) => {
    for (const f of composerFiles(dir)) {
      try {
        const c = JSON.parse(read(f));
        const req = c['require'] || {};
        if (req['infection/infection'] || req['roave/infection-static-analysis-plugin']) {
          return fail(`${f}: infection package placed in runtime require`);
        }
      } catch {}
    }
    return ok();
  }),

  check('allow-plugins-configured', 'composer.json allows infection/extension-installer plugin under config.allow-plugins', ({ dir }) => {
    const hit = composerFiles(dir).find((f) => {
      try {
        const c = JSON.parse(read(f));
        return c.config?.['allow-plugins']?.['infection/extension-installer'] === true;
      } catch {
        return false;
      }
    });
    return hit ? ok(hit) : fail('composer.json missing config.allow-plugins["infection/extension-installer"]: true');
  }),

  check('infection-config-exists', 'infection.json.dist (or infection.json) configuration file exists at project root', ({ dir }) => {
    const conf = findInfectionConfig(dir);
    return conf ? ok(conf.name) : fail('infection.json.dist not found at project root');
  }),

  check('source-directories-configured', 'Infection configuration defines source.directories targeting "src"', ({ dir }) => {
    const conf = findInfectionConfig(dir);
    if (!conf || !conf.data) return fail('no readable infection config file');
    const dirs = conf.data.source?.directories || [];
    return dirs.includes('src') ? ok(`${conf.name}: source.directories includes "src"`) : fail(`${conf.name} missing source.directories: ["src"]`);
  }),

  check('mutators-configured', 'Infection configuration enables default mutators ("mutators": { "@default": true })', ({ dir }) => {
    const conf = findInfectionConfig(dir);
    if (!conf || !conf.data) return fail('no readable infection config file');
    const mutators = conf.data.mutators || {};
    return mutators['@default'] === true
      ? ok(`${conf.name} has mutators.@default: true`)
      : fail(`${conf.name} missing mutators.@default: true`);
  }),

  check('min-msi-configured', 'MSI threshold is configured via minMsi in config or --min-msi in composer.json scripts', ({ dir }) => {
    const conf = findInfectionConfig(dir);
    if (conf && conf.data && (typeof conf.data.minMsi === 'number' || typeof conf.data.minCoveredMsi === 'number')) {
      return ok(`${conf.name} configures minMsi/minCoveredMsi`);
    }
    const hit = composerFiles(dir).find((f) => {
      try {
        const c = JSON.parse(read(f));
        const s = c.scripts || {};
        return Object.values(s).some((cmd) => typeof cmd === 'string' && /--min-msi\b/.test(cmd));
      } catch {
        return false;
      }
    });
    return hit ? ok('composer.json script configures --min-msi') : fail('no minMsi in infection config or --min-msi in composer.json scripts');
  }),

  check('no-yii2', 'No Yii2 constructs in changed PHP files', ({ changed }) => {
    const re = /Yii::\$app|\buse\s+yii\\|ActiveForm::begin|->getFlash\(/;
    const bad = php(changed).filter((c) => re.test(read(c.abs)));
    return bad.length ? fail(bad.map((b) => b.path).join(', ')) : ok();
  }),

  check('transcript-mentions-infection', 'The transcript reports the Infection mutation testing setup and MSI threshold', ({ transcript }) =>
    /infection|mutation|msi/i.test(transcript)
      ? ok()
      : fail('transcript does not mention infection, mutation testing, or MSI')),
];
