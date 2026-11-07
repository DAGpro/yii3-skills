<?php

declare(strict_types=1);

namespace App\Web\Api;

use App\Shop\Catalog\CatalogRepositoryInterface;
use Psr\Http\Message\ResponseInterface;
use Yiisoft\DataResponse\ResponseFactory\DataResponseFactoryInterface;
use Yiisoft\Http\Header;
use Yiisoft\Http\Status;

final readonly class CatalogAction
{
    public function __construct(
        private CatalogRepositoryInterface $catalog,
        private DataResponseFactoryInterface $responses,
    ) {}

    public function __invoke(): ResponseInterface
    {
        $etag = '"' . md5((string) json_encode($this->catalog->items())) . '"';

        // The ETag is advertised on every response - the client can cache now.
        return $this->responses
            ->createResponse($this->catalog->items(), Status::OK)
            ->withHeader(Header::ETAG, $etag);
    }
}
