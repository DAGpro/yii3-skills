import { check, ok, fail, read, filesMatching } from '../../lib/checks.mjs';

const php = (changed) => changed.filter((c) => c.path.endsWith('.php'));
const twig = (changed) => changed.filter((c) => c.path.endsWith('.twig'));

/** The page's key content markers that must survive the conversion (fixture views/post/show.php). */
const PAGE_MARKER = 'Latest posts';

/** |raw uses sanctioned by http-views-twig.md: layout lifecycle markers (§2 layout example) and the CSRF hidden input (§3). */
const RAW_SANCTIONED =
  /(?:content|beginPage\s*\(\s*\)|beginBody\s*\(\s*\)|endBody\s*\(\s*\)|endPage\s*\(\s*[^)]*\s*\)|hiddenInput\s*\(\s*\))\s*\|\s*raw/g;

/** Twig template under views/ added by the work. */
const addedViewTwigs = (changed) => twig(changed).filter((c) => c.added && /^views\/.+\.twig$/.test(c.path));

export default [
  // The conversion itself: a real Twig template (twig syntax, no PHP tags), content preserved
  check('twig-template-added', 'An added views/**/*.twig template contains twig syntax ({% for %} loop, {{ ... }} output) and the page content marker, with no PHP tags (<?php / <?=) left inside', ({ changed }) => {
    const twigs = addedViewTwigs(changed);
    if (!twigs.length) return fail('no .twig template added under views/');
    for (const c of twigs) {
      const t = read(c.abs);
      if (!/\{%\s*(?:for|if|do|block|extends)\b/.test(t) || !/\{\{/.test(t)) {
        return fail(`${c.path} contains no Twig syntax ({% ... %} / {{ ... }})`);
      }
      if (!t.includes(PAGE_MARKER)) return fail(`${c.path} lost the page content marker "${PAGE_MARKER}"`);
      if (/<\?php|<\?=|<%/.test(t)) return fail(`${c.path} still contains PHP template tags - PHP syntax is not executed by Twig`);
    }
    return ok(twigs.map((h) => h.path).join(', '));
  }),

  // Render path switched: the action renders the .twig template (guide §4: viewRenderer->render('product/index.twig', ...))
  check('render-targets-twig', 'A changed src/ class renders the Twig template: ->render() with a \'.twig\' template path argument', ({ changed }) => {
    const hits = php(changed)
      .filter((c) => /^src\//.test(c.path))
      .filter((c) => /->\s*render(?:Partial|AsString)?\s*\(\s*['"][^'"]*\.twig['"]/.test(read(c.abs)));
    return hits.length
      ? ok(hits.map((h) => h.path).join(', '))
      : fail('no changed src/ file passes a .twig template path to ->render()');
  }),

  // Renderer wiring per the guide's params block (§1: 'yiisoft/view' renderers['twig'] = TwigTemplateRenderer)
  check('twig-renderer-configured', 'A changed config file registers the Twig renderer: a \'renderers\' map with a \'twig\' entry referencing TwigTemplateRenderer (guide §1 params block)', ({ changed }) => {
    const cfg = php(changed)
      .filter((c) => /^config\/.+\.php$/.test(c.path))
      .map((c) => ({ path: c.path, t: read(c.abs) }))
      .filter(({ t }) => /['"]renderers['"]\s*=>/.test(t) && /['"]twig['"]\s*=>/.test(t));
    if (!cfg.length) return fail("no changed config file adds a 'renderers' map with a 'twig' entry");
    const wired = cfg.filter(({ t }) => /TwigTemplateRenderer/.test(t));
    return wired.length
      ? ok(wired.map((w) => w.path).join(', '))
      : fail(`'twig' renderer entry present but TwigTemplateRenderer is not referenced: ${cfg.map((c) => c.path).join(', ')}`);
  }),

  // Escaping moves to autoescaping: manual escaping calls must be gone from the converted files
  check('no-manual-escaping', 'No htmlspecialchars()/htmlentities() left in changed src/ or views/ PHP files or in the added .twig template - Twig autoescaping replaces the manual calls', ({ changed }) => {
    const scanned = [
      ...php(changed).filter((c) => /^(?:src|views)\//.test(c.path)),
      ...addedViewTwigs(changed),
    ];
    const bad = scanned.filter((c) => /htmlspecialchars\s*\(|htmlentities\s*\(/.test(read(c.abs)));
    return bad.length
      ? fail(`manual escaping calls remain: ${bad.map((b) => b.path).join(', ')}`)
      : ok('no htmlspecialchars()/htmlentities() in converted files');
  }),

  // The trap: |raw defeats autoescaping; the guide sanctions it only for layout lifecycle markers and CSRF input
  check('no-raw-filter', 'The converted page template relies on autoescaping - no |raw filter beyond the guide-sanctioned lifecycle/content/hiddenInput patterns (http-views-twig.md §2-§3)', ({ changed }) => {
    const twigs = addedViewTwigs(changed);
    if (!twigs.length) return fail('no added .twig template to check');
    for (const c of twigs) {
      const remaining = read(c.abs).replace(RAW_SANCTIONED, '').match(/\|\s*raw\b/);
      if (remaining) return fail(`${c.path} uses |raw on page output - this bypasses Twig autoescaping`);
    }
    return ok('no unsanctioned |raw in the added twig template(s)');
  }),

  // The old PHP view is removed or no longer rendered (either is acceptable; rendered = still the active page)
  check('old-view-unreferenced', 'views/post/show.php is either deleted or no longer used as a render target: no src/ file renders the plain \'post/show\' path (a .twig path is fine)', ({ dir }) => {
    const old = filesMatching(dir, /^views\/post\/show\.php$/);
    if (!old.length) return ok('old PHP view removed');
    const stillRendered = filesMatching(dir, /^src\/.+\.php$/)
      .filter((p) => /['"]post\/show['"]/.test(read(p)));
    return stillRendered.length
      ? fail(`show.php still exists and is still rendered by: ${stillRendered.map((p) => p.replace(/\\/g, '/')).join(', ')}`)
      : ok('old PHP view kept but unreferenced');
  }),

  check('no-yii2', 'No Yii2 constructs (Yii::$app, \\Yii::, yii\\ root namespace) in changed PHP or twig files', ({ changed }) => {
    const re = /Yii::\$app|\\Yii::|\buse\s+yii\\/;
    const bad = php(changed).concat(twig(changed)).filter((c) => re.test(read(c.abs)));
    return bad.length ? fail(bad.map((b) => b.path).join(', ')) : ok();
  }),

  check('strict-types', 'declare(strict_types=1) present in every changed PHP file', ({ changed }) => {
    const bad = php(changed).filter((c) => !/declare\(strict_types=1\);/.test(read(c.abs)));
    return bad.length ? fail(bad.map((b) => b.path).join(', ')) : ok();
  }),

  check('transcript-mentions', 'The transcript reports the Twig conversion (twig, autoescaping or escaping)', ({ transcript }) =>
    /twig|autoescap|escaping/i.test(transcript) ? ok() : fail('transcript does not mention the twig/escaping work')),
];
