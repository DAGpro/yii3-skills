<?php

declare(strict_types=1);

namespace App\Blog\Infrastructure;

use Psr\Http\Message\UploadedFileInterface;
use Yiisoft\Aliases\Aliases;
use Yiisoft\Files\FileHelper;

/**
 * Persists uploaded cover images under a runtime directory with server-generated names.
 * Filesystem manipulation lives in infrastructure, not in actions (file-handling guide §5).
 */
final readonly class CoverImageStorage
{
    public function __construct(private Aliases $aliases) {}

    public function save(UploadedFileInterface $upload): string
    {
        $extension = pathinfo((string) $upload->getClientFilename(), PATHINFO_EXTENSION);
        $name = bin2hex(random_bytes(16)) . ($extension === '' ? '' : '.' . $extension);

        $dir = FileHelper::normalizePath($this->aliases->get('@runtime/uploads/covers'));
        FileHelper::ensureDirectory($dir);
        $upload->moveTo("{$dir}/{$name}");

        return "{$dir}/{$name}";
    }
}
