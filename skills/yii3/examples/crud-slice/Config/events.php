<?php

declare(strict_types=1);

use App\Application\Listener\LogPostCreatedListener;
use App\Domain\PostCreated;

/**
 * Declarative PSR-14 event mapping: event class name -> listener list.
 *
 * In a real application this file lives at `config/common/events.php` and is
 * mapped into the `events` config group in `config/configuration.php`
 * (`'events' => 'common/events.php'`), then rebuilt via `composer yii-config-rebuild`.
 * Listeners execute in registration order and are resolved from the DI container.
 */
return [
    PostCreated::class => [
        LogPostCreatedListener::class,
    ],
];
