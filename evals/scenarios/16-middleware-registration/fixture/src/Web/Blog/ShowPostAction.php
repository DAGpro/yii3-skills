<?php

declare(strict_types=1);

namespace App\Web\Blog;

use Psr\Http\Message\ResponseFactoryInterface;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;

final readonly class ShowPostAction
{
    public function __construct(private ResponseFactoryInterface $responseFactory) {}

    public function __invoke(ServerRequestInterface $request): ResponseInterface
    {
        $response = $this->responseFactory->createResponse(200);
        $response->getBody()->write('post ' . $request->getAttribute('id'));

        return $response;
    }
}
