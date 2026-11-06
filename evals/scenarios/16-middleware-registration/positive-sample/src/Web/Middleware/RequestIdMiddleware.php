<?php

declare(strict_types=1);

namespace App\Web\Middleware;

use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Server\MiddlewareInterface;
use Psr\Http\Server\RequestHandlerInterface;

use function bin2hex;
use function random_bytes;

/**
 * Attaches a correlation/request id to request attributes and response headers.
 */
final class RequestIdMiddleware implements MiddlewareInterface
{
    public const ATTRIBUTE_NAME = 'requestId';
    public const HEADER_NAME = 'X-Request-Id';

    public function process(ServerRequestInterface $request, RequestHandlerInterface $handler): ResponseInterface
    {
        $requestId = $request->getHeaderLine(self::HEADER_NAME);
        if ($requestId === '') {
            $requestId = bin2hex(random_bytes(16));
        }

        // PSR-7 immutability: withAttribute() returns a new instance, it must be reassigned.
        $request = $request->withAttribute(self::ATTRIBUTE_NAME, $requestId);

        $response = $handler->handle($request);

        return $response->withHeader(self::HEADER_NAME, $requestId);
    }
}
