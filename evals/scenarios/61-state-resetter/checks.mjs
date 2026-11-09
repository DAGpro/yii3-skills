import { check, ok, fail, read, filesMatching } from '../../lib/checks.mjs';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

export default [
  check('no-state-resetter-di-definition', 'config/di.php MUST NOT define StateResetter::class as a container key', ({ dir }) => {
    const diFiles = filesMatching(dir, /(^|\/)config\/di.*\.php$/);
    for (const f of diFiles) {
      const content = read(f);
      // Check for StateResetter::class => ...
      if (/StateResetter::class\s*=>/i.test(content) || /['"]Yiisoft\\\\Di\\\\StateResetter['"]\s*=>/i.test(content)) {
        return fail(`${f}: defines StateResetter::class directly, which flips useResettersFromMeta=false in Container`);
      }
    }
    return ok();
  }),

  check('service-reset-callback-configured', 'Stateful service definition declares reset callback or ResetInterface in config/di.php', ({ dir }) => {
    const diFiles = filesMatching(dir, /(^|\/)config\/di.*\.php$/);
    let hasReset = false;
    for (const f of diFiles) {
      const content = read(f);
      if (/'reset'\s*=>/i.test(content) || /"reset"\s*=>/i.test(content) || /ResetInterface/i.test(content)) {
        hasReset = true;
        break;
      }
    }
    return hasReset ? ok() : fail('no service definition with "reset" callback found in config/di*.php');
  }),

  check('stateful-service-cleanable', 'RequestContext provides a reset method or cleanable state', ({ dir }) => {
    const sFiles = filesMatching(dir, /(^|\/)src\/.*RequestContext\.php$/);
    if (sFiles.length === 0) return fail('RequestContext.php not found in src/');
    const content = read(sFiles[0]);
    if (!/function\s+(reset|clear)\s*\(/i.test(content)) {
      return fail('RequestContext lacks reset() or clear() method declaration');
    }
    return ok();
  })
];
