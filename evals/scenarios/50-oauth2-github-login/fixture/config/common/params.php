<?php

declare(strict_types=1);

use Yiisoft\Definitions\Reference;
use Yiisoft\Yii\View\Renderer\CsrfViewInjection;

/** @var array $params */

return [
    'yiisoft/yii-view-renderer' => [
        'viewPath' => '@views',
        'layout' => '@views/layout/main.php',
        'injections' => [
            Reference::to(CsrfViewInjection::class),
        ],
    ],
];
