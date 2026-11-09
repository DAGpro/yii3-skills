<?php

declare(strict_types=1);

namespace App;

final class Calculator
{
    public function discount(float $amount, float $percent): float
    {
        if ($percent <= 0.0 || $percent > 100.0) {
            return $amount;
        }

        return $amount - ($amount * ($percent / 100.0));
    }
}
