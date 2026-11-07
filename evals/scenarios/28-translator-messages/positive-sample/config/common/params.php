<?php

declare(strict_types=1);

/** @var array $params */

return [
    'yiisoft/translator' => [
        'locale' => 'en-US',
        'fallbackLocale' => 'en-US',
        'defaultCategory' => 'app',
    ],
    'app' => [
        'messagesPath' => dirname(__DIR__, 2) . '/messages',
    ],
    'yiisoft/yii-view-renderer' => [
        'viewPath' => '@views',
        'layout' => '@views/layout/main.php',
    ],
];
