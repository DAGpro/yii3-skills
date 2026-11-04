<?php

declare(strict_types=1);

namespace App\Application\Listener;

use App\Domain\PostCreated;
use Psr\Log\LoggerInterface;

/**
 * PSR-14 listener for the {@see PostCreated} domain event.
 *
 * Invokable listener classes are resolved and autowired from the DI
 * container (see `Config/events.php`); listeners must stay stateless.
 */
final readonly class LogPostCreatedListener
{
    public function __construct(
        private LoggerInterface $logger,
    ) {}

    public function __invoke(PostCreated $event): void
    {
        $this->logger->info('Post created: "{title}" ({status})', [
            'title' => $event->title,
            'status' => $event->status->value,
        ]);
    }
}
