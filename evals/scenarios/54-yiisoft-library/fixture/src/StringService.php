<?php

declare(strict_types=1);

namespace Acme\TextUtils;

final class StringService
{
    public function titleCase(string $value): string
    {
        return mb_convert_case($value, MB_CASE_TITLE, 'UTF-8');
    }
}
