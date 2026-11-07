<?php

return [
    'id' => 'legacy-yii2-app',
    'basePath' => dirname(__DIR__),
    'components' => [
        'request' => ['cookieValidationKey' => 'dev-only-key'],
    ],
];
