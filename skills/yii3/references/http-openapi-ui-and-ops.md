# Yii3 OpenAPI: Swagger UI, CLI Generation & Operations

> [!IMPORTANT]
> **Grounding rule:** sources of truth are split by question type — API: installed `vendor/yiisoft/<pkg>/src/` (versions via `composer.lock`); implementation patterns: this guide; project conventions: the project's architecture artifact or dominant `src/` style. Full table and conflict rule: SKILL.md Core rule 2.

> Part of the [OpenAPI & Swagger Guide](http-openapi-swagger.md) split — anti-patterns and related guides live there.

## 7. Offline CLI Specification Generator

For continuous integration (CI/CD) pipelines or deploying static documentation, generate the OpenAPI specification file directly via a Symfony Console command without launching the web server.

### 7.1. Command Implementation

```php
declare(strict_types=1);

namespace App\Infrastructure\Console\Command;

use Symfony\Component\Console\Command\Command;
use Symfony\Component\Console\Input\InputInterface;
use Symfony\Component\Console\Input\InputOption;
use Symfony\Component\Console\Output\OutputInterface;
use Symfony\Component\Console\Style\SymfonyStyle;
use Yiisoft\Aliases\Aliases;
use Yiisoft\Yii\Swagger\Service\SwaggerService;

use function file_put_contents;
use function implode;
use function sprintf;

final class SwaggerGenerateCommand extends Command
{
    protected static $defaultName = 'swagger/generate';
    protected static $defaultDescription = 'Scans PHP attributes and compiles openapi.json offline';

    /**
     * @param string[] $defaultPaths
     */
    public function __construct(
        private readonly SwaggerService $swaggerService,
        private readonly Aliases $aliases,
        private readonly array $defaultPaths,
    ) {
        parent::__construct();
    }

    protected function configure(): void
    {
        $this->addOption(
            'output',
            'o',
            InputOption::VALUE_OPTIONAL,
            'Output file path',
            '@public/openapi.json'
        );
        $this->addOption(
            'format',
            'f',
            InputOption::VALUE_OPTIONAL,
            'Output format ("json" or "yaml")',
            'json'
        );
    }

    protected function execute(InputInterface $input, OutputInterface $output): int
    {
        $io = new SymfonyStyle($input, $output);
        $io->title('Compiling OpenAPI Specification');

        $outputPath = (string) $input->getOption('output');
        $format = (string) $input->getOption('format');

        $resolvedFile = $this->aliases->get($outputPath);

        $io->text(sprintf('Scanning directories: %s', implode(', ', $this->defaultPaths)));
        $openApi = $this->swaggerService->fetch($this->defaultPaths);

        $content = $format === 'yaml' ? $openApi->toYaml() : $openApi->toJson();
        file_put_contents($resolvedFile, $content);

        $io->success(sprintf('OpenAPI specification generated successfully: %s', $resolvedFile));

        return Command::SUCCESS;
    }
}
```

### 7.2. Console DI Wiring (`config/console/di/swagger.php`)

```php
declare(strict_types=1);

use App\Infrastructure\Console\Command\SwaggerGenerateCommand;
use Yiisoft\Aliases\Aliases;
use Yiisoft\Yii\Swagger\Service\SwaggerService;

/** @var array $params */

return [
    SwaggerGenerateCommand::class => [
        '__construct()' => [
            'defaultPaths' => $params['yiisoft/yii-swagger']['source-paths'],
        ],
    ],
];
```

---

## 8. Swagger UI Customization & Asset Management

### 8.1. UI Configuration Parameters (`ui-params`)

The `ui-params` array in `config/params.php` configures the browser client:

```php
'ui-params' => [
    'dom_id' => '#swagger-ui',
    'deepLinking' => true,
    'displayRequestDuration' => true,
    'persistAuthorization' => true,     // Persists authorization across page refreshes
    'filter' => true,                   // Filter input box
    'showExtensions' => true,           // Renders x- extensions
    'showCommonExtensions' => true,
    'docExpansion' => 'list',           // 'none', 'list', or 'full'
    'defaultModelsExpandDepth' => 1,
    'maxDisplayedTags' => 50,
    'syntaxHighlight' => [
        'activate' => true,
        'theme' => 'agate',             // 'agate', 'arta', 'monokai', 'nord', etc.
    ],
],
```

### 8.2. Customizing the HTML View Template via `Theme::$pathMap`

`SwaggerUi::handle()` resolves its template file `swagger-ui.php` via `$swaggerService->getViewPath()`. To override the template without touching vendor files, use Yii 3 View Theme mapping in `config/web/params.php`:

```php
declare(strict_types=1);

use Yiisoft\Yii\Swagger\Service\SwaggerService;

use function dirname;

return [
    'yiisoft/view' => [
        'theme' => [
            'pathMap' => [
                dirname((new \ReflectionClass(SwaggerService::class))->getFileName(), 2) . '/views' => '@views/swagger',
            ],
        ],
    ],
];
```

Copy `vendor/yiisoft/yii-swagger/views/swagger-ui.php` to your application at `views/swagger/swagger-ui.php` and customize the HTML header, corporate logos, or analytics scripts.

Theme path mapping mechanics (`Yiisoft\View\Theme`, `pathMap`) are owned by the [Views & Widgets Guide, §2.4 — Application View Theming](http-views.md#24-application-view-theming-yiisoftviewtheme).

### 8.3. Custom CSS Theme & Dark Mode

To apply custom branding or dark themes to Swagger UI, create an asset bundle in your application:

```php
declare(strict_types=1);

namespace App\Infrastructure\Asset;

use Yiisoft\Assets\AssetBundle;
use Yiisoft\Yii\Swagger\Asset\SwaggerUiAsset;

final class SwaggerDarkThemeAsset extends AssetBundle
{
    public ?string $basePath = '@assets';
    public ?string $baseUrl = '@assetsUrl';
    public ?string $sourcePath = '@resources/assets/swagger-dark';

    public array $css = [
        'swagger-dark.css',
    ];

    public array $depends = [
        SwaggerUiAsset::class,
    ];
}
```

Register this bundle globally in `config/packages/yiisoft/assets.php` or inside your customized `views/swagger/swagger-ui.php`:

```php
/** @var Yiisoft\Assets\AssetManager $assetManager */
$assetManager->register(\App\Infrastructure\Asset\SwaggerDarkThemeAsset::class);
```

Asset bundle declaration (`AssetBundle` properties, `depends`, publishing, CDN with SRI) is owned by the [Views & Widgets Guide, §6.1 — Declaring an Asset Bundle](http-widgets-and-assets.md#61-declaring-an-asset-bundle-assetbundle-properties--cdn-with-sri).

### 8.4. CDN Asset Serving for Serverless Deployments

For read-only serverless filesystems (e.g. AWS Lambda, Google Cloud Run) where local `@assets` directories cannot be written to at runtime:

```php
// config/params.php
return [
    'yiisoft/assets' => [
        'assetManager' => [
            'customizedBundles' => [
                \Yiisoft\Yii\Swagger\Asset\SwaggerUiAsset::class => [
                    'cdn' => true,
                    'baseUrl' => 'https://unpkg.com/swagger-ui-dist@5',
                    'css' => ['swagger-ui.css'],
                    'js' => ['swagger-ui-bundle.js', 'swagger-ui-standalone-preset.js'],
                ],
            ],
        ],
    ],
];
```

Full `customizedBundles` semantics (overriding and disabling bundles in `params.php`) are documented in the [Views & Widgets Guide, §6.7 — Overriding & Disabling Bundles](http-widgets-and-assets.md#67-overriding--disabling-bundles-customizedbundles-in-paramsphp).

---

## 9. Environment Protection & Performance Caching

### 9.1. Caching Mechanics & The Infinite Dev Cache Trap

`SwaggerJson::handle()` executes the following caching logic:

```php
if (!$this->enableCache) {
    $openApi = $this->swaggerService->fetch($this->paths);
} else {
    /** @var OpenApi $openApi */
    $openApi = $this->cache->getOrSet(
        [self::class, $this->paths],
        fn() => $this->swaggerService->fetch($this->paths),
        $this->cacheTTL,
    );
}
```

In `vendor/yiisoft/yii-swagger/config/di-web.php`:

```php
if (\array_key_exists('cacheTTL', $params)) {
    $swaggerJson = $swaggerJson->withCache($params['cacheTTL']);
}
```

> [!CAUTION]
> **The Infinite Dev Cache Trap:**
> Many developers write `'cacheTTL' => null` believing `null` disables caching.
> 1. `\array_key_exists('cacheTTL', $params)` evaluates to **`true`** even if the value is `null`!
> 2. This calls `$swaggerJson->withCache(null)`, which sets `$this->enableCache = true` and `$this->cacheTTL = null`.
> 3. Under PSR-16 / `Yiisoft\Cache\Cache`, passing a `null` TTL translates to `Ttl::forever()`.
> 4. **Result:** The specification is compiled once and cached **permanently** in development. Attribute edits will never appear until the cache is manually purged!

### 9.2. Conditional Production Caching Configuration

To completely disable caching in development and enable it in production, use conditional array spreading in `config/params.php`:

```php
declare(strict_types=1);

return [
    'yiisoft/yii-swagger' => [
        'source-paths' => [
            '@src/Presentation/Action',
            '@src/Application/DTO',
        ],
        // Dev: 'cacheTTL' is completely absent -> $enableCache remains false.
        // Prod: 'cacheTTL' is 86400 (24h) -> cached in PSR-16 store.
        ...($_ENV['APP_ENV'] === 'prod' ? ['cacheTTL' => 86400] : []),
    ],
];
```

### 9.3. Restricting Access in Production (IP Filtering & Authentication)

To prevent unauthorized public inspection of internal API documentation:

#### Option 1: Restricting via IP Filtering Middleware

Because `yiisoft/yii-middleware` has no configuration plugin and defaults `$ipRanges` to an empty array (which blocks all incoming requests), configure allowed IP ranges using either a DI container definition or a route middleware closure factory.

**Approach A: DI Container Definition (`config/common/di/ip-filter.php`)**

```php
declare(strict_types=1);

use Yiisoft\Yii\Middleware\IpFilter;

/** @var array $params */
return [
    IpFilter::class => [
        '__construct()' => [
            'ipRanges' => $params['adminAllowedIPs'] ?? ['127.0.0.1', '10.0.0.0/8', '192.168.1.0/24'],
        ],
    ],
];
```

Then attach the middleware class directly to the route group:

```php
declare(strict_types=1);

use Yiisoft\Router\Group;
use Yiisoft\Yii\Middleware\IpFilter;

(new Group('/swagger'))->routes(
    // ... routes
)->middleware(IpFilter::class);
```

**Approach B: Route Closure Factory (Inline without DI configuration)**

```php
declare(strict_types=1);

use Psr\Http\Message\ResponseFactoryInterface;
use Yiisoft\Router\Group;
use Yiisoft\Validator\ValidatorInterface;
use Yiisoft\Yii\Middleware\IpFilter;

(new Group('/swagger'))->routes(
    // ... routes
)->middleware(
    static fn (ResponseFactoryInterface $responseFactory, ValidatorInterface $validator): IpFilter =>
        new IpFilter(
            validator: $validator,
            responseFactory: $responseFactory,
            ipRanges: ['127.0.0.1', '10.0.0.0/8', '192.168.1.0/24'],
        )
);
```

#### Option 2: Guarding with Administrative Authentication Middleware

```php
declare(strict_types=1);

use App\Presentation\Middleware\AdminAuthMiddleware;
use Yiisoft\Router\Group;

(new Group('/swagger'))->routes(
    // ... routes
)->middleware(AdminAuthMiddleware::class);
```

#### Option 3: Conditional Route Registration

```php
declare(strict_types=1);

use Yiisoft\DataResponse\Middleware\JsonDataResponseMiddleware;
use Yiisoft\Router\Group;
use Yiisoft\Router\Route\Get;
use Yiisoft\Yii\Swagger\Action\SwaggerJson;
use Yiisoft\Yii\Swagger\Action\SwaggerUi;

$routes = [
    // Core application routes...
];

// Completely exclude Swagger routes in production environments if not desired
if ($_ENV['APP_ENV'] !== 'prod') {
    $routes[] = (new Group('/swagger'))->routes(
        (new Get(''))
            ->action(static fn (SwaggerUi $ui): SwaggerUi => $ui->withJsonUrl('/swagger/json-url'))
            ->name('swagger.ui'),
        (new Get('/json-url'))
            ->middleware(JsonDataResponseMiddleware::class)
            ->action(SwaggerJson::class)
            ->name('swagger.json'),
    );
}

return $routes;
```

### 9.4. Cache Invalidation Strategies

When deploying new code releases in production:

1. **Clear the Entire Cache Pool:** Run `./yii cache/flush` during your deployment pipeline.
2. **Programmatic Key Invalidation:** If using selective invalidation, remove the specific cache key:
   ```php
   use Yiisoft\Cache\CacheInterface;
   use Yiisoft\Yii\Swagger\Action\SwaggerJson;

   $paths = $params['yiisoft/yii-swagger']['source-paths'];
   $cache->remove([SwaggerJson::class, $paths]);
   ```

---
