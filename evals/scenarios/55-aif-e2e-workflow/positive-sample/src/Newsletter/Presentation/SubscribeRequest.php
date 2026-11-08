<?php

declare(strict_types=1);

namespace App\Newsletter\Presentation;

use Yiisoft\Validator\Rule\Email;
use Yiisoft\Validator\Rule\Required;

final class SubscribeRequest
{
    #[Required]
    #[Email]
    public string $email = '';
}

