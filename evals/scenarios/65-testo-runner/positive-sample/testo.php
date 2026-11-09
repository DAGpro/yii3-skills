<?php

declare(strict_types=1);

use Testo\Config\Config;
use Testo\Config\Suite;

return Config::create()
    ->withSuite(
        Suite::create('Unit')
            ->withDirectory(__DIR__ . '/tests')
    );
