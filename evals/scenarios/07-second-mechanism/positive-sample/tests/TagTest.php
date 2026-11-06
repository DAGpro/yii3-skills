<?php

declare(strict_types=1);

namespace App\Tests;

use App\Blog\Domain\Tag;
use PHPUnit\Framework\TestCase;

final class TagTest extends TestCase
{
    public function testTableName(): void
    {
        $this->assertSame('tag', (new Tag())->tableName());
    }
}
