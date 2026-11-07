<?php

declare(strict_types=1);

// NOTE: After making changes in this file, run `composer yii-config-rebuild` to update the merge plan.
return [
    'config-plugin' => [
        'params' => 'common/params.php',
        'events' => [],
        'events-web' => ['$events'],
        'events-console' => ['$events'],
        'routes' => 'web/routes.php',
    ],
    'config-plugin-options' => [
        'source-directory' => 'config',
    ],
];
