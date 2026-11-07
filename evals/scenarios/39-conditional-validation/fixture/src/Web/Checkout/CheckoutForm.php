<?php

declare(strict_types=1);

namespace App\Web\Checkout;

use Yiisoft\FormModel\FormModel;
use Yiisoft\Validator\Rule\BooleanValue;
use Yiisoft\Validator\Rule\Length;
use Yiisoft\Validator\Rule\Required;
use Yiisoft\Validator\RulesProviderInterface;

final class CheckoutForm extends FormModel implements RulesProviderInterface
{
    public bool $hasCoupon = false;
    public string $name = '';
    public string $address = '';
    public string $couponCode = '';

    public function getRules(): array
    {
        return [
            'hasCoupon' => [new BooleanValue()],
            'name' => [new Required(), new Length(min: 1, max: 100)],
            'address' => [new Required(), new Length(min: 5, max: 255)],
            // Known bug: demanded from every customer, with or without a coupon.
            'couponCode' => [new Required()],
        ];
    }
}
