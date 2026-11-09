<?php

declare(strict_types=1);

use App\Service\RequestContext;
use Yiisoft\Di\StateResetter;

return [
    // Catastrophic antipattern: defining StateResetter::class flips useResettersFromMeta to false!
    StateResetter::class => [
        'class' => StateResetter::class,
    ],
    RequestContext::class => [
        'class' => RequestContext::class,
        // Missing 'reset' callback
    ],
];
