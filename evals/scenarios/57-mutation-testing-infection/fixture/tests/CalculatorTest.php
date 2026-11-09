<?php

declare(strict_types=1);

namespace App\Tests;

use App\Calculator;
use PHPUnit\Framework\TestCase;

final class CalculatorTest extends TestCase
{
    public function testDiscount(): void
    {
        $calculator = new Calculator();
        $this->assertSame(90.0, $calculator->discount(100.0, 10.0));
        $this->assertSame(100.0, $calculator->discount(100.0, 0.0));
    }
}
