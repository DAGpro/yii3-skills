<?php

declare(strict_types=1);

/** @var array $params */

return [
    'aliases' => [
        '@root' => dirname(__DIR__, 2),
        '@src' => '@root/src',
        '@assets' => '@root/public/assets',
        '@assetsUrl' => '/assets',
    ],
    'yiisoft/yii-swagger' => [
        // Directories scanned for OpenAPI PHP 8 attributes (our actions + the ApiDoc metadata class).
        'source-paths' => [
            '@src/Web/Api',
        ],
        'ui-params' => [
            'persistAuthorization' => true,
        ],
    ],
];
