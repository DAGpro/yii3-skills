<?php

declare(strict_types=1);

use Psr\SimpleCache\CacheInterface as PsrCacheInterface;
use Yiisoft\Cache\Cache;
use Yiisoft\Cache\CacheInterface as YiisoftCacheInterface;
use Yiisoft\Cache\File\FileCache;

/**
 * Persistent PSR-16 store: override the ArrayCache default shipped by yiisoft/cache.
 * FileCache::class itself is defined by the yiisoft/cache-file config plugin
 * (params: 'yiisoft/cache-file' => ['fileCache' => [...]]).
 */
return [
    PsrCacheInterface::class => FileCache::class,
    YiisoftCacheInterface::class => Cache::class,
];
