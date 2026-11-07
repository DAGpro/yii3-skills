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

    'yiisoft/yii-auth-client' => [
        'clients' => [
            'github' => [
                'class' => Yiisoft\Yii\AuthClient\Client\GitHub::class,
                'clientId' => $_ENV['GITHUB_CLIENT_ID'],
                'clientSecret' => $_ENV['GITHUB_CLIENT_SECRET'],
                'oauth2ReturnUrl' => 'https://blog.example.com/auth/github',
            ],
        ],
    ],
];
