<?php

declare(strict_types=1);

namespace App\Web\Blog;

use Yiisoft\FormModel\FormModel;
use Yiisoft\Validator\Rule\Length;
use Yiisoft\Validator\Rule\Required;

final class EditPostForm extends FormModel
{
    #[Required]
    #[Length(min: 1, max: 255)]
    public string $title = '';

    #[Required]
    #[Length(min: 1, max: 10000)]
    public string $content = '';
}
