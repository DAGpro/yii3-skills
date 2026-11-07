<?php

declare(strict_types=1);

namespace App\Web\Auth;

use Yiisoft\FormModel\FormModel;
use Yiisoft\Validator\Rule\Length;
use Yiisoft\Validator\Rule\Required;

final class LoginForm extends FormModel
{
    #[Required]
    #[Length(min: 1, max: 100)]
    public string $login = '';

    #[Required]
    #[Length(min: 6, max: 100)]
    public string $password = '';
}
