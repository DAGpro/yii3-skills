<?php

declare(strict_types=1);

use App\Web\Middleware\AdminIpAllowlistMiddleware;

/** @var array $params */

return [
    // The office allowlist is injected from params - swap it per environment
    // without touching the middleware code.
    AdminIpAllowlistMiddleware::class => [
        '__construct()' => [
            'allowedRanges' => $params['app']['adminIpRanges'],
        ],
    ],
];
