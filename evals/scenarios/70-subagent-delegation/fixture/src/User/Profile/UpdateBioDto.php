<?php

declare(strict_types=1);

namespace App\User\Profile;

use Yiisoft\Validator\Rule\Length;
use Yiisoft\Validator\Rule\Required;

final class UpdateBioDto
{
    #[Required]
    public int $userId = 0;

    #[Required]
    #[Length(max: 500)]
    public string $bio = '';
}
