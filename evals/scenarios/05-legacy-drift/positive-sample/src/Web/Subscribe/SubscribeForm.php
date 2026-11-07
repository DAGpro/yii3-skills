<?php

declare(strict_types=1);

namespace App\Web\Subscribe;

use Yiisoft\Validator\Rule\Email;
use Yiisoft\Validator\Rule\Required;
use Yiisoft\FormModel\FormModel;

final class SubscribeForm extends FormModel
{
    #[Required]
    #[Email]
    public string $email = '';
}
