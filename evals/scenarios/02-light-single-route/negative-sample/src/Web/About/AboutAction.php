<?php

declare(strict_types=1);

namespace App\Web\About;

use App\Web\About\Application\AboutUseCase;
use Psr\Http\Message\ResponseInterface;
use Yiisoft\DataResponse\ResponseFactory\DataResponseFactoryInterface;

final readonly class AboutAction
{
    public function __construct(private AboutUseCase $useCase, private DataResponseFactoryInterface $responses) {}

    public function __invoke(): ResponseInterface
    {
        return $this->responses->createResponse($this->useCase->handle());
    }
}
