<?php

declare(strict_types=1);

use App\Domain\PostRepositoryInterface;
use App\Persistence\DbPostRepository;

return [
    // Domain port -> infrastructure adapter.
    // `Application\CreatePostHandler`, `Application\Listener\LogPostCreatedListener`,
    // and the actions need no explicit definitions: they are autowired by yiisoft/di
    // (the `LoggerInterface` and `EventDispatcherInterface` bindings come from the
    // installed `yiisoft/log` / `yiisoft/yii-event` package configurations).
    PostRepositoryInterface::class => DbPostRepository::class,
];
