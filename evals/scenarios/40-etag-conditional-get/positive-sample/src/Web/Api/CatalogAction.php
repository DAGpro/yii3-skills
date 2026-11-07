<?php

declare(strict_types=1);

namespace App\Web\Api;

use App\Shop\Catalog\CatalogRepositoryInterface;
use Psr\Http\Message\ResponseFactoryInterface;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Yiisoft\DataResponse\ResponseFactory\DataResponseFactoryInterface;
use Yiisoft\Http\Header;
use Yiisoft\Http\Status;

final readonly class CatalogAction
{
    public function __construct(
        private CatalogRepositoryInterface $catalog,
        private DataResponseFactoryInterface $responses,
        private ResponseFactoryInterface $responseFactory,
    ) {}

    public function __invoke(ServerRequestInterface $request): ResponseInterface
    {
        // The version changes only when the catalog data changes - a perfect ETag source.
        $etag = '"' . sha1($this->catalog->version()) . '"';
        $clientEtag = $request->getHeaderLine(Header::IF_NONE_MATCH);

        if ($clientEtag === $etag) {
            // RFC 7232: a 304 must carry no message body; the ETag is echoed back.
            return $this->responseFactory
                ->createResponse(Status::NOT_MODIFIED)
                ->withHeader(Header::ETAG, $etag);
        }

        return $this->responses
            ->createResponse($this->catalog->items(), Status::OK)
            ->withHeader(Header::ETAG, $etag);
    }
}
