<?php

declare(strict_types=1);

namespace App\Blog\Application;

use App\Domain\Subscription\EmailAlreadySubscribedException;

/**
 * Fixture use case: the storage lookup is stubbed, but the domain exception
 * contract is real - it must surface as a mapped API error response.
 */
final readonly class SubscribeService
{
    private const TAKEN_EMAILS = ['taken@example.com'];

    public function subscribe(string $email): void
    {
        if (in_array($email, self::TAKEN_EMAILS, true)) {
            throw EmailAlreadySubscribedException::forEmail($email);
        }
    }
}
