<?php

declare(strict_types=1);

namespace App\Web\Blog;

use App\Blog\Application\Queue\SendDigestMessage;
use Psr\Http\Message\ResponseInterface;
use Yiisoft\DataResponse\ResponseFactory\DataResponseFactoryInterface;
use Yiisoft\Queue\QueueProducerInterface;

final readonly class RequestDigestAction
{
    public function __construct(
        private QueueProducerInterface $producer,
        private DataResponseFactoryInterface $responses,
    ) {}

    public function __invoke(): ResponseInterface
    {
        // Returns immediately; the worker performs the heavy digest generation.
        $this->producer->push(new SendDigestMessage(initiatedByUserId: 1));

        return $this->responses->createResponse(['status' => 'queued']);
    }
}
