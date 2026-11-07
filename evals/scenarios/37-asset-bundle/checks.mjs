import { check, ok, fail, read, filesMatching } from '../../lib/checks.mjs';

const php = (changed) => changed.filter((c) => c.path.endsWith('.php'));

/** Added src/ PHP classes extending the grounded AssetBundle (references/assets/src/AssetBundle.php:21). */
const bundleClasses = (changed) =>
  php(changed)
    .filter((c) => c.added && /^src\//.test(c.path))
    .filter((c) => /extends\s+\\?(?:Yiisoft\\Assets\\)?AssetBundle\b/.test(read(c.abs)));

/** Changed src/ or views/ PHP that is not itself an AssetBundle subclass - candidate wiring points. */
const wiringFiles = (changed) =>
  php(changed)
    .filter((c) => /^(?:src|views)\//.test(c.path))
    .filter((c) => !/extends\s+\\?(?:Yiisoft\\Assets\\)?AssetBundle\b/.test(read(c.abs)));

/** Hardcoded asset tags the bundle must replace (fixture layout wrote both). */
const HARDCODED_TAG = /<link[^>]+rel="stylesheet"|<script[^>]+src=["']\/(?:css|js)\//;

export default [
  // A bundle class exists at all
  check('bundle-class-added', 'An added src/ class extends Yiisoft\\Assets\\AssetBundle (use-import + short extends or FQ)', ({ changed }) => {
    const bundles = bundleClasses(changed);
    return bundles.length
      ? ok(bundles.map((b) => b.path).join(', '))
      : fail('no added class extends Yiisoft\\Assets\\AssetBundle');
  }),

  // The bundle actually carries the site assets (grounded property shape: $css line 78, $js line 175)
  check('bundle-declares-assets', 'The AssetBundle subclass declares the site assets: a $css array entry containing site.css and a $js array entry containing app.js', ({ changed }) => {
    const bundles = bundleClasses(changed);
    if (!bundles.length) return fail('no AssetBundle subclass to inspect');
    const complete = bundles.filter((c) => {
      const t = read(c.abs);
      return /\$css\s*=\s*\[[^\]]*site\.css/s.test(t) && /\$js\s*=\s*\[[^\]]*app\.js/s.test(t);
    });
    return complete.length
      ? ok(complete.map((c) => c.path).join(', '))
      : fail('bundle class does not declare both the site.css and app.js entries');
  }),

  // basePath/sourcePath + baseUrl both set (AssetBundle.php:31/41/292; AssetLoader.php:56-68 throws otherwise)
  check('bundle-paths-set', 'The bundle sets a web-accessible directory ($basePath or $sourcePath) AND $baseUrl - the grounded AssetLoader throws InvalidConfigException unless both are set', ({ changed }) => {
    const bundles = bundleClasses(changed);
    if (!bundles.length) return fail('no AssetBundle subclass to inspect');
    const okBundles = bundles.filter((c) => {
      const t = read(c.abs);
      const dir = /\$\b(?:basePath|sourcePath)\b\s*=\s*['"][^'"]+['"]/.test(t);
      const url = /\$baseUrl\s*=\s*['"][^'"]*['"]/.test(t);
      return dir && url;
    });
    return okBundles.length
      ? ok(okBundles.map((c) => c.path).join(', '))
      : fail('bundle class does not set both the directory (basePath/sourcePath) and baseUrl properties');
  }),

  // The hardcoded tags are gone from the rendered markup (layout + any other view/src php)
  check('no-hardcoded-asset-tags', 'No hardcoded <link rel="stylesheet"> or <script src="/css|js/..."> tags remain in any views/ or src/ PHP file - the asset system replaces them', ({ dir }) => {
    const bad = filesMatching(dir, /^(?:views|src)\/.+\.php$/).filter((p) => HARDCODED_TAG.test(read(p)));
    return bad.length
      ? fail(`hardcoded asset tags remain: ${bad.map((p) => p.replace(/\\/g, '/')).join(', ')}`)
      : ok('no hardcoded asset tags in views/ or src/');
  }),

  // The page actually registers the bundle (guide §6.2: $assetManager->register(AppAsset::class))
  check('bundle-wired-into-page', 'A changed src/ or views/ file (outside the bundle class) registers the bundle through the asset system: ->register(<...Asset>::class)', ({ changed }) => {
    const hits = wiringFiles(changed).filter((c) => /->\s*register\s*\(\s*\\?[A-Z][\w\\]*Asset::class/.test(read(c.abs)));
    return hits.length
      ? ok(hits.map((h) => h.path).join(', '))
      : fail('no changed file registers the asset bundle via ->register(<...Asset>::class)');
  }),

  // Registered files must reach the page (AssetManager::register() is void - getCssFiles()/getJsFiles()/getUrl() are the only grounded readers)
  check('assets-flow-to-webview', 'The registered bundle files are consumed from the AssetManager into the page: getCssFiles()/getJsFiles()/getUrl() called on the injected manager in a changed src/ or views/ file', ({ changed }) => {
    const hits = wiringFiles(changed).filter((c) => /->\s*(?:getCssFiles|getJsFiles|getUrl)\s*\(/.test(read(c.abs)));
    return hits.length
      ? ok(hits.map((h) => h.path).join(', '))
      : fail('registered files are never read back from the AssetManager (register() alone delivers nothing to the HTML)');
  }),

  check('no-yii2', 'No Yii2 constructs (Yii::$app, \\Yii::, yii\\ root namespace) in changed PHP files', ({ changed }) => {
    const re = /Yii::\$app|\\Yii::|\buse\s+yii\\/;
    const bad = php(changed).filter((c) => re.test(read(c.abs)));
    return bad.length ? fail(bad.map((b) => b.path).join(', ')) : ok();
  }),

  check('strict-types', 'declare(strict_types=1) present in every changed PHP file', ({ changed }) => {
    const bad = php(changed).filter((c) => !/declare\(strict_types=1\);/.test(read(c.abs)));
    return bad.length ? fail(bad.map((b) => b.path).join(', ')) : ok();
  }),

  check('transcript-mentions', 'The transcript reports the asset bundle work (asset bundle, AssetManager or assets)', ({ transcript }) =>
    /asset[\s-]*bundle|assetmanager|assets/i.test(transcript) ? ok() : fail('transcript does not mention the asset bundle work')),
];
