<?php

declare(strict_types=1);

namespace App\Blog\Application;

use Yiisoft\Input\Http\Attribute\Data\FromBody;
use Yiisoft\Input\Http\AbstractInput;
use Yiisoft\Hydrator\Validator\Attribute\Validate;
use Yiisoft\Validator\Rule\Integer;
use Yiisoft\Validator\Rule\Length;

#[FromBody]
final class SaveSettingsInput extends AbstractInput
{
    #[Validate(new Length(min: 1, max: 100))]
    public string $title = '';

    #[Validate(new Integer(min: 1, max: 50))]
    public int $postsPerPage = 10;

    #[Validate(new Length(max: 500))]
    public string $description = '';
}
