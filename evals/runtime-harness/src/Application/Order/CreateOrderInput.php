<?php

declare(strict_types=1);

namespace App\Application\Order;

use Yiisoft\Hydrator\Validator\ValidatedInputInterface;
use Yiisoft\Hydrator\Validator\ValidatedInputTrait;
use Yiisoft\Validator\Rule\Integer;
use Yiisoft\Validator\Rule\Length;
use Yiisoft\Validator\Rule\Required;

final class CreateOrderInput implements ValidatedInputInterface
{
    use ValidatedInputTrait;

    #[Required]
    #[Length(min: 3, max: 120)]
    public string $customerEmail = '';

    #[Required]
    #[Integer(min: 1)]
    public int $amountCents = 0;
}
