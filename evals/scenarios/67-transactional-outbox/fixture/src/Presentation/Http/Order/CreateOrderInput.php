<?php

declare(strict_types=1);

namespace App\Presentation\Http\Order;

use Yiisoft\Hydrator\Validator\Attribute\Validate;
use Yiisoft\Hydrator\Validator\ValidatedInputInterface;
use Yiisoft\Hydrator\Validator\ValidatedInputTrait;
use Yiisoft\Validator\Rule\Integer;
use Yiisoft\Validator\Rule\Length;
use Yiisoft\Validator\Rule\Required;

final class CreateOrderInput implements ValidatedInputInterface
{
    use ValidatedInputTrait;

    #[Validate(new Required(), new Length(min: 1, max: 64))]
    public string $orderId = '';

    #[Validate(new Required(), new Length(min: 1, max: 64))]
    public string $userId = '';

    #[Validate(new Integer(min: 1))]
    public int $totalCents = 0;
}
