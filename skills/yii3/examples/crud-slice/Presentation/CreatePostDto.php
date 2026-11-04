<?php

declare(strict_types=1);

namespace App\Presentation;

use App\Domain\PostStatus;
use Yiisoft\Validator\Rule\InEnum;
use Yiisoft\Validator\Rule\Length;
use Yiisoft\Validator\Rule\Required;
use Yiisoft\Validator\Rule\StringValue;

/**
 * Strongly-typed Input DTO for post creation.
 * Uses PHP 8 attributes from yiisoft/validator for self-contained validation rules.
 *
 * `status` is validated against the {@see PostStatus} enum values, so the
 * action's `PostStatus::from()` conversion can never receive an unknown value.
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

    #[Required]
    #[StringValue]
    #[InEnum(class: PostStatus::class)]
    public string $status = PostStatus::Draft->value;
}
