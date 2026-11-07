<?php

declare(strict_types=1);

namespace App\Web\Checkout;

use Yiisoft\FormModel\FormModel;
use Yiisoft\Validator\Rule\BooleanValue;
use Yiisoft\Validator\Rule\Length;
use Yiisoft\Validator\Rule\Required;
use Yiisoft\Validator\RulesProviderInterface;
use Yiisoft\Validator\ValidationContext;

final class CheckoutForm extends FormModel implements RulesProviderInterface
{
    public bool $hasCoupon = false;
    public string $name = '';
    public string $address = '';
    public ?string $couponCode = null;

    public function getRules(): array
    {
        return [
            'hasCoupon' => [new BooleanValue()],
            'name' => [new Required(), new Length(min: 1, max: 100)],
            'address' => [new Required(), new Length(min: 5, max: 255)],
            // The requirement itself is conditional: applied only for coupon orders.
            'couponCode' => [
                new Required(
                    when: static fn (mixed $value, ValidationContext $context): bool =>
                        (bool) $context->getDataSet()->getPropertyValue('hasCoupon'),
                ),
            ],
        ];
    }
}
