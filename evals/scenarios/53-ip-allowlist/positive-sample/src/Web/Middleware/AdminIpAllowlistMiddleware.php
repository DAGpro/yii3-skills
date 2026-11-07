<?php

declare(strict_types=1);

namespace App\Web\Middleware;

use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Server\MiddlewareInterface;
use Psr\Http\Server\RequestHandlerInterface;
use Yiisoft\DataResponse\ResponseFactory\DataResponseFactoryInterface;
use Yiisoft\Http\Status;
use Yiisoft\NetworkUtilities\IpHelper;

/**
 * Restricts access to the configured allowlist of IP ranges (the office network).
 * The ranges come from config params - they are never hardcoded here.
 */
final readonly class AdminIpAllowlistMiddleware implements MiddlewareInterface
{
    public function __construct(
        private DataResponseFactoryInterface $responses,
        private array $allowedRanges,
    ) {}

    public function process(ServerRequestInterface $request, RequestHandlerInterface $handler): ResponseInterface
    {
        $ip = (string) ($request->getServerParams()['REMOTE_ADDR'] ?? '');

        foreach ($this->allowedRanges as $range) {
            if (IpHelper::inRange($ip, $range)) {
                return $handler->handle($request);
            }
        }

        // Empty or non-matching allowlist: deny. (An empty allowlist must never allow-all.)
        return $this->responses->createResponse(
            ['title' => 'Forbidden', 'status' => Status::FORBIDDEN],
            Status::FORBIDDEN,
        );
    }
}
