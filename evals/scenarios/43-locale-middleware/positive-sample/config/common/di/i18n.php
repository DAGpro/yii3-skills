<?php

declare(strict_types=1);

use Yiisoft\I18n\Locale;
use Yiisoft\I18n\LocaleProvider;

return [
    LocaleProvider::class => [
        'class' => LocaleProvider::class,
        '__construct()' => [
            'defaultLocale' => new Locale('en-US'),
        ],
    ],
];
