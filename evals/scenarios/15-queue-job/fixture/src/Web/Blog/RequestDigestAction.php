<?php

declare(strict_types=1);

namespace App\Web\Blog;

use App\Blog\Application\DigestGenerator;
use Psr\Http\Message\ResponseInterface;
use Yiisoft\DataResponse\ResponseFactory\DataResponseFactoryInterface;

final readonly class RequestDigestAction
{
    public function __construct(
        private DigestGenerator $digest,
        private DataResponseFactoryInterface $responses,
    ) {}

    public function __invoke(): ResponseInterface
    {
        // Slow: blocks the request until every subscriber digest is built and sent.
        $processed = $this->digest->generateWeeklyDigest();

        return $this->responses->createResponse(['status' => 'digest sent', 'subscribers' => $processed]);
    }
}
