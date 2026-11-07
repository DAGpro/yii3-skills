<?php

declare(strict_types=1);

namespace App\Application\Queue;

use Yiisoft\Queue\Message\Message;

final class WelcomeEmailMessage extends Message
{
    public function __construct(
        public readonly string $email,
        public readonly string $name,
    ) {}
}
