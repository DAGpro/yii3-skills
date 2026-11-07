<?php

declare(strict_types=1);

namespace App\Web\Auth;

use App\User\Validation\ReservedUsername;
use Yiisoft\FormModel\FormModel;
use Yiisoft\Validator\Rule\Email;
use Yiisoft\Validator\Rule\Length;
use Yiisoft\Validator\Rule\Required;
use Yiisoft\Validator\RulesProviderInterface;

final class SignupForm extends FormModel implements RulesProviderInterface
{
    public string $username = '';
    public string $email = '';
    public string $password = '';

    public function getRules(): array
    {
        return [
            'username' => [new Required(), new Length(min: 3, max: 32), new ReservedUsername()],
            'email' => [new Required(), new Email()],
            'password' => [new Required(), new Length(min: 8, max: 64)],
        ];
    }
}
