<?php

declare(strict_types=1);

namespace App\User\Profile;

use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Yiisoft\DataResponse\ResponseFactory\DataResponseFactoryInterface;

final class UpdateBioAction
{
    public function __construct(
        private readonly UserRepositoryInterface $userRepository,
        private readonly DataResponseFactoryInterface $responseFactory,
    ) {
    }

    public function __invoke(ServerRequestInterface $request, UpdateBioDto $dto): ResponseInterface
    {
        $this->userRepository->updateBio($dto->userId, $dto->bio);

        return $this->responseFactory->createResponse(['success' => true]);
    }
}
