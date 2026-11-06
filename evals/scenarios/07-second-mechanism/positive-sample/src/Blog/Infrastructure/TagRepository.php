<?php

declare(strict_types=1);

namespace App\Blog\Infrastructure;

use App\Blog\Domain\Tag;
use App\Blog\Domain\TagRepositoryInterface;

final readonly class TagRepository implements TagRepositoryInterface
{
    public function all(): array
    {
        return Tag::find()->all();
    }
}
