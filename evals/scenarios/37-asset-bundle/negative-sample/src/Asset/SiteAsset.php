<?php

declare(strict_types=1);

namespace App\Asset;

use Yiisoft\Assets\AssetBundle;

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
