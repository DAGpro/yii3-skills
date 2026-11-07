<?php

declare(strict_types=1);

namespace App\Api;

/**
 * Application status reported by the public API.
 */
final readonly class StatusService
{
    /**
     * @return array{status: string}
     */
    public function get(): array
    {
        return ['status' => 'ok'];
    }
}
