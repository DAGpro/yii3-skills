<?php

declare(strict_types=1);

namespace App\Web\Blog;

use App\Blog\Application\DigestGenerator;
use Psr\Http\Message\ResponseInterface;
use Yiisoft\DataResponse\ResponseFactory\DataResponseFactoryInterface;
use Yiisoft\Queue\QueueInterface;

final readonly class RequestDigestAction
{
    public function __construct(
        private QueueInterface $queue,
        private DataResponseFactoryInterface $responses,
    ) {}

    public function __invoke(): ResponseInterface
    {
        // Heavy work deferred to a closure job picked up by the worker.
        $this->queue->push(static function (): void {
            (new DigestGenerator())->generateWeeklyDigest();
        });

        return $this->responses->createResponse(['status' => 'queued']);
    }
}
