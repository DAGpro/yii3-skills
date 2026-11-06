<?php

declare(strict_types=1);

use App\Blog\Application\Listener\AuditPostPublishedListener;
use App\Blog\Domain\PostPublishedEvent;

return [
    PostPublishedEvent::class => [
        AuditPostPublishedListener::class,
    ],
];
