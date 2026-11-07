<?php

declare(strict_types=1);

namespace App\Web;

use Yiisoft\Assets\AssetManager;
use Yiisoft\Yii\View\Renderer\CommonParametersInjectionInterface;

/**
 * Makes the asset manager available in every template and in the layout,
 * mirroring the CsrfViewInjection pattern.
 */
final readonly class AssetInjection implements CommonParametersInjectionInterface
{
    public function __construct(private AssetManager $assets) {}

    public function getCommonParameters(): array
    {
        return ['assetManager' => $this->assets];
    }
}
