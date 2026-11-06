<?php

declare(strict_types=1);

namespace App\Web\Blog;

use App\Blog\Domain\PostRepositoryInterface;
use App\Blog\Infrastructure\DbViewCounter;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Yiisoft\DataResponse\ResponseFactory\DataResponseFactoryInterface;
use Yiisoft\Db\Connection\ConnectionInterface;
use Yiisoft\Router\CurrentRoute;

final readonly class ShowPostAction
{
    public function __construct(
        private PostRepositoryInterface $posts,
        private ConnectionInterface $db,
        private DataResponseFactoryInterface $responses,
    ) {}

    public function __invoke(ServerRequestInterface $request, CurrentRoute $route): ResponseInterface
    {
        $post = $this->posts->find((int) $route->getArgument('id'));
        (new DbViewCounter($this->db))->increment((int) $route->getArgument('id'));
        return $this->responses->createResponse($post);
    }
}
