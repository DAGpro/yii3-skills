<?php

declare(strict_types=1);

namespace App\Asset;

use Yiisoft\Assets\AssetBundle;

/**
 * Site-wide css/js. The files are already web-accessible under public/, so no
 * $sourcePath publishing is needed: the loader serves them straight from $basePath
 * at $baseUrl (grounded: AssetLoader throws unless both are set; with a relative
 * entry the URL is "{baseUrl}/{entry}", so an empty baseUrl yields /css/site.css).
 */
final class SiteAsset extends AssetBundle
{
    public ?string $basePath = '@public';
    public ?string $baseUrl = '';

    public array $css = [
        'css/site.css',
    ];

    public array $js = [
        'js/app.js',
    ];
}
