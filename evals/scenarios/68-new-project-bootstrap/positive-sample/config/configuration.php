<?php

declare(strict_types=1);

return [
    'config-plugin' => [
        'params' => 'common/params.php',
        'params-web' => ['$params', 'web/params.php'],
        'params-console' => ['$params', 'console/params.php'],
        'di' => 'common/di/*.php',
        'di-web' => ['$di', 'web/di/*.php'],
        'di-console' => '$di',
        'events' => [],
        'routes' => 'common/routes.php',
    ],
    'config-plugin-options' => [
        'source-directory' => 'config',
    ],
];
