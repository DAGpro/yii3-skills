<?php

declare(strict_types=1);

namespace App\Web\Blog;

use App\Blog\Application\AddCommentHandler;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Yiisoft\DataResponse\ResponseFactory\DataResponseFactoryInterface;
use Yiisoft\Router\CurrentRoute;

final readonly class AddCommentAction
{
    public function __construct(private AddCommentHandler $handler, private DataResponseFactoryInterface $responses) {}

    public function __invoke(ServerRequestInterface $request, CurrentRoute $route): ResponseInterface
    {
        ($this->handler)((int) $route->getArgument('id'), (string) ($request->getParsedBody()['body'] ?? ''));
        return $this->responses->createResponse(['status' => 'created'], 201);
    }
}
