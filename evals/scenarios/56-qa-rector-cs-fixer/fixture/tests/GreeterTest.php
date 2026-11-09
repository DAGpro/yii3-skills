<?php

declare(strict_types=1);

namespace App\Tests;

use App\Greeter;
use PHPUnit\Framework\TestCase;

final class GreeterTest extends TestCase
{
    public function testGreet(): void
    {
        $greeter = new Greeter();
        $this->assertSame('Hello, Alice!', $greeter->greet('Alice'));
    }
}
