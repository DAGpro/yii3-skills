<?php

declare(strict_types=1);

namespace App\Web\Blog;

use App\Blog\Application\LatestPostsService;
use Psr\Http\Message\ResponseInterface;
use Yiisoft\DataResponse\ResponseFactory\DataResponseFactoryInterface;

final readonly class LatestPostsAction
{
    public function __construct(
        private LatestPostsService $posts,
        private DataResponseFactoryInterface $responses,
    ) {}

    public function __invoke(): ResponseInterface
    {
        return $this->responses->createResponse($this->posts->latestPosts());
    }
}
