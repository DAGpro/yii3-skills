<?php

declare(strict_types=1);

namespace App\Tests;

use Testo\Assert;
use Testo\Attribute\Test;

final class MathTest
{
    #[Test]
    public function testAddition(): void
    {
        Assert::same(4, 2 + 2);
    }
}
