<?php

declare(strict_types=1);

/** @var array $params */

return [
    'app' => [
        // Office network allowlist for the /admin section (CIDR subnets or single IPs).
        'adminIpRanges' => [
            '203.0.113.0/24',
        ],
    ],
];
