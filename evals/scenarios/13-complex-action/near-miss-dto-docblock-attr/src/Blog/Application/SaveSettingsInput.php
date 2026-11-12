<?php

declare(strict_types=1);

namespace App\Blog\Application;

use Yiisoft\Input\Http\Attribute\Data\FromBody;
use Yiisoft\Input\Http\AbstractInput;
use Yiisoft\Hydrator\Validator\Attribute\Validate;
use Yiisoft\Validator\Rule\Integer;
use Yiisoft\Validator\Rule\Length;

/**
 * Validation rules (docblock copy - NOT real attributes):
 * #[Validate(new Length(min: 1, max: 100))] on title,
 * #[Validate(new Integer(min: 1, max: 50))] on postsPerPage,
 * #[Validate(new Length(max: 500))] on description.
 */
#[FromBody]
final class SaveSettingsInput extends AbstractInput
{
    public string $title = '';

    public int $postsPerPage = 10;

    public string $description = '';
}
