<?php

declare(strict_types=1);

namespace App\Presentation;

use Yiisoft\Validator\Rule\Length;
use Yiisoft\Validator\Rule\Required;
use Yiisoft\Validator\Rule\StringValue;

/**
 * Strongly-typed Input DTO for post creation.
 * Uses PHP 8 attributes from yiisoft/validator for self-contained validation rules.
 */
final class CreatePostDto
{
    #[Required]
    #[StringValue]
    #[Length(min: 3, max: 255)]
    public string $title = '';

    #[Required]
    #[StringValue]
    #[Length(min: 10)]
    public string $content = '';

    #[StringValue]
    #[Length(max: 32)]
    public string $status = 'draft';
}
