<?php

declare(strict_types=1);

use Yiisoft\Translator\CategorySource;
use Yiisoft\Translator\Message\Php\MessageSource;
use Yiisoft\Translator\SimpleMessageFormatter;

/** @var array $params */

return [
    'translation.app' => [
        'definition' => static function () use ($params) {
            $messageSource = new MessageSource($params['app']['messagesPath']);

            return new CategorySource(
                name: 'app',
                reader: $messageSource,
                formatter: new SimpleMessageFormatter(),
                writer: $messageSource,
            );
        },
        'tags' => ['translation.categorySource'],
    ],
];
