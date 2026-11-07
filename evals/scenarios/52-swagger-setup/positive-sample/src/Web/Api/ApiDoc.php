<?php

declare(strict_types=1);

namespace App\Web\Api;

use OpenApi\Attributes as OA;

/**
 * Central OpenAPI metadata. Uninstantiated - scanned together with the actions
 * (source-paths covers this directory), contributes the info block to the spec.
 */
#[OA\Info(
    version: '1.0.0',
    title: 'Acme Orders API',
    description: 'Orders API built with Yii 3.',
)]
#[OA\Server(
    url: '/',
    description: 'Current environment',
)]
final class ApiDoc
{
}
