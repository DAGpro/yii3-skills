<?php

declare(strict_types=1);

namespace App\Web\Blog;

use App\Blog\Application\PostPublisher;
use App\Blog\Domain\Post;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Yiisoft\DataResponse\ResponseFactory\DataResponseFactoryInterface;
use Yiisoft\Router\CurrentRoute;

final readonly class PublishPostAction
{
    public function __construct(
        private PostPublisher $publisher,
        private DataResponseFactoryInterface $responses,
    ) {}

    public function __invoke(ServerRequestInterface $request, CurrentRoute $route): ResponseInterface
    {
        // Fixture: post lookup omitted; a fixed post stands in for the repository.
        $post = new Post((int) $route->getArgument('id'), 'Publishing without notifications', 'author@example.com');
        $this->publisher->publish($post);

        return $this->responses->createResponse(['status' => 'published']);
    }
}
