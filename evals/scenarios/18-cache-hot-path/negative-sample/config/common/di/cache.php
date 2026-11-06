<?php

declare(strict_types=1);

use Psr\SimpleCache\CacheInterface as PsrCacheInterface;
use Yiisoft\Cache\Cache;
use Yiisoft\Cache\CacheInterface as YiisoftCacheInterface;
use Yiisoft\Cache\File\FileCache;

return [
    PsrCacheInterface::class => FileCache::class,
    YiisoftCacheInterface::class => Cache::class,
];
