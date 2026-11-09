<?php

declare(strict_types=1);

use App\Service\RequestContext;

return [
    RequestContext::class => [
        'class' => RequestContext::class,
        'reset' => function () {
            /** @var RequestContext $this */
            $this->reset();
        },
    ],
];
