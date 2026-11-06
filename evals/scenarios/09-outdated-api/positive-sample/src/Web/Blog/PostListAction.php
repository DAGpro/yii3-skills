<?php

declare(strict_types=1);

namespace App\Web\Blog;

use App\Blog\Domain\PostRepositoryInterface;
use Psr\Http\Message\ResponseInterface;
use Yiisoft\DataResponse\ResponseFactory\DataResponseFactoryInterface;

final readonly class PostListAction
{
    public function __construct(private PostRepositoryInterface $posts, private DataResponseFactoryInterface $responses) {}

    public function __invoke(): ResponseInterface
    {
        return $this->responses->createResponse($this->posts->all());
    }
}
