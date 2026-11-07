<?php

declare(strict_types=1);

namespace App\Web\Blog;

use App\Blog\Domain\TagRepositoryInterface;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Yiisoft\DataResponse\ResponseFactory\DataResponseFactoryInterface;

final readonly class CreateTagAction
{
    public function __construct(
        private TagRepositoryInterface $tags,
        private DataResponseFactoryInterface $responses,
    ) {}

    public function __invoke(ServerRequestInterface $request): ResponseInterface
    {
        $name = trim((string) ($request->getParsedBody()['name'] ?? ''));
        $tag = $this->tags->create($name);

        return $this->responses->createResponse(['status' => 'created', 'name' => $tag->getName()]);
    }
}
