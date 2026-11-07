<?php

declare(strict_types=1);

use Yiisoft\Aliases\Aliases;
use Yiisoft\Definitions\DynamicReference;
use Yiisoft\Definitions\Reference;
use Yiisoft\View\Twig\TwigTemplateRenderer;

/** @var array $params */

return [
    'yiisoft/yii-view-renderer' => [
        'viewPath' => '@views',
        'layout' => '@views/layout/main.php',
    ],
    'yiisoft/view' => [
        'renderers' => [
            'twig' => Reference::to(TwigTemplateRenderer::class),
        ],
        // Note: use 'fallbackExtension' in modern yiisoft/view (not 'defaultExtension')
        'fallbackExtension' => 'twig',
    ],
    'yiisoft/yii-twig' => [
        'options' => [
            // Resolve the alias like the package params do — a plain '@...' string is passed
            // verbatim into Twig\Environment and never alias-resolved by the DI wiring:
            'cache' => DynamicReference::to(static fn (Aliases $aliases) => $aliases->get('@runtime/twig/cache')),
            'debug' => true,
            'auto_reload' => true,
        ],
        // No 'loader' key needed: the package DI already mounts the views directory
        // as the FIRST FilesystemLoader path.
    ],
];
