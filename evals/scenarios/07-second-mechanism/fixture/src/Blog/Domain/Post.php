<?php

declare(strict_types=1);

namespace App\Blog\Domain;

use Yiisoft\ActiveRecord\ActiveRecord;

final class Post extends ActiveRecord
{
    public function tableName(): string
    {
        return 'post';
    }
}
