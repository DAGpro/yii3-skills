<?php

declare(strict_types=1);

namespace App\Web\Blog;

use App\Blog\Application\RelatedPostsService;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Yiisoft\DataResponse\ResponseFactory\DataResponseFactoryInterface;
use Yiisoft\Http\Status;
use Yiisoft\Router\CurrentRoute;

final readonly class RelatedPostsAction
{
    public function __construct(
        private RelatedPostsService $relatedPosts,
        private CurrentRoute $currentRoute,
        private DataResponseFactoryInterface $responses,
    ) {}

    public function __invoke(ServerRequestInterface $request): ResponseInterface
    {
        // getArgument() returns ?string - check it before the typed service call.
        $id = $this->currentRoute->getArgument('id');
        if ($id === null) {
            return $this->responses->createResponse(
                ['error' => 'Missing required parameter "id".'],
                Status::BAD_REQUEST
            );
        }

        $related = $this->relatedPosts->findRelated((int) $id);

        return $this->responses->createResponse(
            ['data' => $related],
            Status::OK
        );
    }
}
