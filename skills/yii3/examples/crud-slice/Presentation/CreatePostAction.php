<?php

declare(strict_types=1);

namespace App\Presentation;

use App\Domain\Post;
use App\Domain\PostRepositoryInterface;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Yiisoft\DataResponse\ResponseFactory\DataResponseFactoryInterface;
use Yiisoft\Http\Status;
use Yiisoft\Hydrator\HydratorInterface;
use Yiisoft\Validator\ValidatorInterface;

/**
 * Invokable thin Action that handles HTTP POST requests to create a new post.
 * Coordinates request body parsing, DTO hydration, input validation, and repository persistence.
 */
final readonly class CreatePostAction
{
    public function __construct(
        private HydratorInterface $hydrator,
        private ValidatorInterface $validator,
        private DataResponseFactoryInterface $responseFactory,
        private PostRepositoryInterface $postRepository,
    ) {}

    public function __invoke(ServerRequestInterface $request): ResponseInterface
    {
        /** @var array<string, mixed> $data */
        $data = (array) ($request->getParsedBody() ?? []);

        /** @var CreatePostDto $dto */
        $dto = $this->hydrator->create(CreatePostDto::class, $data);

        $result = $this->validator->validate($dto);
        if (!$result->isValid()) {
            return $this->responseFactory->createResponse(
                [
                    'status' => 'error',
                    'errors' => $result->getErrorMessagesIndexedByPath(),
                ],
                Status::UNPROCESSABLE_ENTITY, // HTTP 422
            );
        }

        $post = new Post(
            id: null,
            title: $dto->title,
            content: $dto->content,
            status: $dto->status,
        );

        $this->postRepository->save($post);

        return $this->responseFactory->createResponse(
            [
                'status' => 'success',
                'data' => $post->toArray(),
            ],
            Status::CREATED, // HTTP 201
        );
    }
}
