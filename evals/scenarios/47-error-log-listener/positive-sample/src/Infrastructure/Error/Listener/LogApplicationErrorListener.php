<?php

declare(strict_types=1);

namespace App\Infrastructure\Error\Listener;

use Psr\Log\LoggerInterface;
use Yiisoft\ErrorHandler\Event\ApplicationError;

final readonly class LogApplicationErrorListener
{
    public function __construct(
        private LoggerInterface $logger,
    ) {}

    public function __invoke(ApplicationError $event): void
    {
        $throwable = $event->getThrowable();

        $this->logger->error(
            'Uncaught application error: {message}',
            [
                'message' => $throwable->getMessage(),
                'exception' => $throwable,
                'file' => $throwable->getFile(),
                'line' => $throwable->getLine(),
            ],
        );
    }
}
