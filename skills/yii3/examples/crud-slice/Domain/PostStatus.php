<?php

declare(strict_types=1);

namespace App\Domain;

/**
 * Publication lifecycle of a Post.
 *
 * A string-backed enum keeps the aggregate type-safe while remaining
 * 1:1 mappable to the `status` VARCHAR column of the `{{%post}}` table.
 */
enum PostStatus: string
{
    case Draft = 'draft';
    case Published = 'published';
    case Archived = 'archived';
}
