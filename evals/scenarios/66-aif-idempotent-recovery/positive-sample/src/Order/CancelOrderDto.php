<?php

declare(strict_types=1);

namespace App\Order;

use Yiisoft\Validator\Rule\Length;
use Yiisoft\Validator\Rule\Required;

final class CancelOrderDto
{
    public function __construct(
        #[Required]
        #[Length(min: 3, max: 255)]
        public readonly string $reason,
        #[Required]
        public readonly string $operatorId,
    ) {
    }
}
