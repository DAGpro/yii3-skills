<?php

declare(strict_types=1);

namespace App\Web\Admin;

use Psr\Http\Message\ResponseInterface;
use Yiisoft\DataResponse\ResponseFactory\DataResponseFactoryInterface;
use Yiisoft\Http\Status;

final readonly class AdminDashboardAction
{
    public function __construct(private DataResponseFactoryInterface $responses) {}

    public function __invoke(): ResponseInterface
    {
        // Only the office network may see the dashboard.
        $ip = $_SERVER['REMOTE_ADDR'] ?? '';
        if (!str_starts_with($ip, '203.0.113.')) {
            return $this->responses->createResponse(
                ['title' => 'Forbidden'],
                Status::FORBIDDEN,
            );
        }

        return $this->responses->createResponse(
            ['title' => 'Admin dashboard'],
            Status::OK,
        );
    }
}
