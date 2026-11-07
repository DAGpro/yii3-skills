<?php

declare(strict_types=1);

namespace App\User\Validation;

use Attribute;
use Yiisoft\Validator\RuleInterface;

#[Attribute(Attribute::TARGET_PROPERTY | Attribute::IS_REPEATABLE)]
final class ReservedUsername implements RuleInterface
{
    /**
     * @param list<string> $usernames
     */
    public function __construct(
        public readonly array $usernames = ['admin', 'root', 'support'],
        public readonly string $message = 'This username is reserved and cannot be used.',
    ) {}

    public function getHandler(): string
    {
        return ReservedUsernameHandler::class;
    }
}
