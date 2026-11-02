<?php

declare(strict_types=1);

namespace App\Presentation;

use App\Domain\PostRepositoryInterface;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Yiisoft\DataResponse\ResponseFactory\DataResponseFactoryInterface;
use Yiisoft\Http\Status;
use Yiisoft\Router\CurrentRoute;

/**
 * Invokable thin Action that handles HTTP GET requests to view a single post by ID.
 * Reads route arguments via CurrentRoute and returns 200 OK or 404 Not Found.
 */
final readonly class ViewPostAction
{
    public function __construct(
        private CurrentRoute $currentRoute,
        private DataResponseFactoryInterface $responseFactory,
        private PostRepositoryInterface $postRepository,
    ) {}

    public function __invoke(ServerRequestInterface $request): ResponseInterface
    {
        $id = $this->currentRoute->getArgument('id');
        if ($id === null || !ctype_digit($id)) {
            return $this->responseFactory->createResponse(
                [
                    'status' => 'error',
                    'message' => 'Invalid or missing post ID.',
                ],
                Status::BAD_REQUEST, // HTTP 400
            );
        }

        $post = $this->postRepository->findById((int) $id);
        if ($post === null) {
            return $this->responseFactory->createResponse(
                [
                    'status' => 'error',
                    'message' => 'Post not found.',
                ],
                Status::NOT_FOUND, // HTTP 404
            );
        }

        return $this->responseFactory->createResponse(
            [
                'status' => 'success',
                'data' => $post->toArray(),
            ],
            Status::OK, // HTTP 200
        );
    }
}
