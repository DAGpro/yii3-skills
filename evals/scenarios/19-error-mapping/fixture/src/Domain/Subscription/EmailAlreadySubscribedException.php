<?php

declare(strict_types=1);

namespace App\Domain\Subscription;

use RuntimeException;

/**
 * Domain rule violation: the given email is already subscribed.
 */
final class EmailAlreadySubscribedException extends RuntimeException
{
    public static function forEmail(string $email): self
    {
        return new self("The email \"$email\" is already subscribed.");
    }
}
