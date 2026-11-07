<?php

declare(strict_types=1);

use App\Web\AssetInjection;
use Yiisoft\Definitions\Reference;

/** @var array $params */

return [
    'aliases' => [
        '@root' => dirname(__DIR__, 2),
        '@public' => '@root/public',
    ],
    'yiisoft/yii-view-renderer' => [
        'viewPath' => '@views',
        'layout' => '@views/layout/main.php',
        'injections' => [
            Reference::to(AssetInjection::class),
        ],
    ],
];
