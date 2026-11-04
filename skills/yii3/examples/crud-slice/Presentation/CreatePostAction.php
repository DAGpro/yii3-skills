<?php

declare(strict_types=1);

namespace App\Presentation;

use App\Application\CreatePostCommand;
use App\Application\CreatePostHandler;
use App\Domain\PostStatus;
use DomainException;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Yiisoft\DataResponse\ResponseFactory\DataResponseFactoryInterface;
use Yiisoft\Http\Status;
use Yiisoft\Hydrator\HydratorInterface;
use Yiisoft\Validator\ValidatorInterface;

/**
 * Invokable thin Action handling HTTP POST requests to create a post.
 *
 * HTTP orchestration only: hydrate the input DTO, validate it, translate
 * the result into an application command, delegate to the use case handler,
 * and map the outcome to an HTTP response. No domain or persistence logic.
 */
final readonly class CreatePostAction
{
    public function __construct(
        private HydratorInterface $hydrator,
        private ValidatorInterface $validator,
        private DataResponseFactoryInterface $responseFactory,
        private CreatePostHandler $handler,
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

        try {
            $post = $this->handler->handle(new CreatePostCommand(
                title: $dto->title,
                content: $dto->content,
                status: PostStatus::from($dto->status),
            ));
        } catch (DomainException $e) {
            return $this->responseFactory->createResponse(
                [
                    'status' => 'error',
                    'message' => $e->getMessage(),
                ],
                Status::CONFLICT, // HTTP 409
            );
        }

        return $this->responseFactory->createResponse(
            [
                'status' => 'success',
                'data' => $post->toArray(),
            ],
            Status::CREATED, // HTTP 201
        );
    }
}
