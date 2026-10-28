# Yii3 File Handling Guide

> Practical guide for filesystem operations with `yiisoft/files`, file download responses with
> `yiisoft/response-download`, and the PSR-7 upload flow combined with `yiisoft/validator` file rules.
>
> **Source of Truth & Verification Rule for AI Models:**
> In projects using this extension, always verify exact method signatures and options directly in
> `vendor/yiisoft/<package>/src/` for installed packages.
> When generating code, if an installed package's method signature or option is unfamiliar or in doubt,
> **read its source files in `vendor/yiisoft/<package>/src/`** rather than guessing.

---

## Table of Contents
- [1. Package Map](#1-package-map)
- [2. Filesystem Utilities (`yiisoft/files`)](#2-filesystem-utilities-yiisoftfiles)
  - [2.1. FileHelper](#21-filehelper)
  - [2.2. Path Matchers](#22-path-matchers)
- [3. Download Responses (`yiisoft/response-download`)](#3-download-responses-yiisoftresponse-download)
  - [3.1. Factory Methods](#31-factory-methods)
  - [3.2. x-Sendfile Support](#32-x-sendfile-support)
  - [3.3. Range Requests](#33-range-requests)
- [4. File Uploads (PSR-7 + Validator)](#4-file-uploads-psr-7--validator)
- [5. Placement & Wiring](#5-placement--wiring)
- [6. Anti-Pattern Matrix](#6-anti-pattern-matrix)

---

## 1. Package Map

| Package | Role | Notes |
|---|---|---|
| `yiisoft/files` | Static filesystem utilities: directories, copying, deletion, path normalization, wildcard filtering | `Yiisoft\Files\FileHelper` + `PathMatcher\*` classes. **No** `File`/`Directory` objects, **no** upload helpers. |
| `yiisoft/response-download` | Factory for PSR-7 download responses (attachment/inline, x-sendfile, byte ranges) | `Yiisoft\ResponseDownload\DownloadResponseFactory`. **Concrete class, no factory interface exists.** |
| `yiisoft/validator` | Upload validation rules: `Rule\File\File` (extensions, MIME, size), `Rule\Image\Image` (dimensions) | See `references/validation-and-forms.md` §2.3. |
| `yiisoft/input-http` | `#[UploadedFiles]` parameter attribute to pull uploaded files into action arguments | See `references/validation-and-forms.md` §8. |

Standard PSR-7 upload consumption (`UploadedFileInterface::moveTo()`, `getClientFilename()`,
`getClientMediaType()`, `getSize()`, `getError()`) is not wrapped by any `yiisoft/*` package — actions handle it
directly (§4).

## 2. Filesystem Utilities (`yiisoft/files`)

### 2.1. FileHelper

`Yiisoft\Files\FileHelper` is a **static-only** utility class (no constructor, no instance state). Complete public
static API (from `src/FileHelper.php`):

| Method | Purpose |
|---|---|
| `ensureDirectory(string $path, int $mode = 0775): void` | recursive `mkdir` + `chmod`; no-op when the directory exists |
| `normalizePath(string $path): string` | `\` → `/`, collapses `//`, resolves `.` / `..` |
| `unlink(string $path): void` | cross-platform delete (chmod `0777` on non-writable Windows files) |
| `isEmptyDirectory(string $path): bool` | emptiness check |
| `removeDirectory(string $directory, array $options = []): void` | options: `traverseSymlinks` (default `false`) |
| `clearDirectory(string $directory, array $options = []): void` | empties the directory; options: `traverseSymlinks`, `filter` (a `PathMatcherInterface`) |
| `copyDirectory(string $source, string $destination, array $options = []): void` | options in §2.1.1 |
| `copyFile(string $source, string $destination, array $options = []): void` | options: `dirMode` (default `0755`), `fileMode`, `beforeCopy`, `afterCopy` |
| `findFiles(string $directory, array $options = []): array` / `findDirectories(...): array` | returns `string[]`; options: `filter` (`PathMatcherInterface`), `recursive` (default `true`) |
| `lastModifiedTime(string\|RecursiveDirectoryIterator ...$paths): ?int` | latest mtime across paths |
| `openFile(string $filename, string $mode, bool $useIncludePath = false, $context = null)` | `fopen` wrapper; throws `RuntimeException` on failure |

> [!IMPORTANT]
> `FileHelper` has **no** `exists()`, `isSymlink()`, `touch()`, or `pathCombine()` methods — do not invent them.
> Use `file_exists()` / `is_file()` directly, and string interpolation or `normalizePath()` for combining paths.

#### 2.1.1. copyDirectory options

```php
FileHelper::copyDirectory($source, $destination, [
    'dirMode' => 0755,               // directory permissions for created dirs
    'fileMode' => null,              // file permissions (chmod when set)
    'filter' => $pathMatcher,        // PathMatcherInterface — skip non-matching paths
    'recursive' => true,             // descend into subdirectories
    'copyEmptyDirectories' => true,  // keep empty dirs
    'beforeCopy' => static fn (string $from, string $to): bool => /* false cancels this file */,
    'afterCopy' => static fn (string $from, string $to): void => /* ... */,
]);
```

`copyDirectory` throws `InvalidArgumentException` when the destination equals the source or lies inside it.

### 2.2. Path Matchers

Filtering for `findFiles()`, `findDirectories()`, and `clearDirectory()` uses `Yiisoft\Files\PathMatcher\*`:

```php
use Yiisoft\Files\PathMatcher\PathMatcher;

// String patterns: trailing '/' → matches directories only, otherwise files only.
// Matching is case-insensitive by default.
$filter = (new PathMatcher())
    ->only('*.php', 'bin/')            // keep these
    ->except('.git/', '*.lock');       // drop these

$files = FileHelper::findFiles('@runtime/exports', ['filter' => $filter]);
```

- `PathMatcher` is immutable and fluent (`only()` / `except()` / `callback()` — the latter takes a closure).
- `PathPattern` wraps a shell wildcard (`Yiisoft\Strings\WildcardPattern`); tune it with `caseSensitive()`,
  `onlyFiles()`, `onlyDirectories()`.
- `CompositeMatcher::any(...$matchers)` / `CompositeMatcher::all(...$matchers)` combine matchers.
- `PathMatcherInterface::match(string $path): ?bool` — `null` means "skipped" (does not decide).

## 3. Download Responses (`yiisoft/response-download`)

Inject the concrete `Yiisoft\ResponseDownload\DownloadResponseFactory` (there is **no**
`DownloadResponseFactoryInterface`) — the package ships no `config/di.php`, but the class autowires from two
PSR-17 factories already bound by the HTTP layer:

```php
public function __construct(
    private readonly ResponseFactoryInterface $responseFactory, // Psr\Http\Message\ResponseFactoryInterface
    private readonly StreamFactoryInterface $streamFactory,     // Psr\Http\Message\StreamFactoryInterface
) {}
```

### 3.1. Factory Methods

All four methods return `Psr\Http\Message\ResponseInterface`. Verbatim signatures (from
`src/DownloadResponseFactory.php`):

```php
public function sendFile(
    string $filePath,
    ?string $attachmentName = null,     // null → basename($filePath)
    string $disposition = ContentDispositionHeader::ATTACHMENT,
    ?string $mimeType = null,           // null → auto-detected via finfo, fallback 'application/octet-stream'
    ?ServerRequestInterface $request = null,
): ResponseInterface;

public function sendContentAsFile(
    string $content,
    string $attachmentName,             // required
    string $disposition = ContentDispositionHeader::ATTACHMENT,
    ?string $mimeType = null,
    ?ServerRequestInterface $request = null,
): ResponseInterface;

public function sendStreamAsFile(
    StreamInterface $stream,
    string $attachmentName,             // required
    string $disposition = ContentDispositionHeader::ATTACHMENT,
    string $mimeType = self::MIME_APPLICATION_OCTET_STREAM,
    ?ServerRequestInterface $request = null,
): ResponseInterface;

public function xSendFile(
    string $filePath,
    ?string $attachmentName = null,
    string $disposition = ContentDispositionHeader::ATTACHMENT,
    ?string $mimeType = null,
    string $xHeader = 'X-Sendfile',
): ResponseInterface;
```

- `$disposition` must be `Yiisoft\Http\ContentDispositionHeader::ATTACHMENT` or `::INLINE`; anything else throws
  `InvalidArgumentException`. Resulting header value: `attachment; filename="report.pdf"`.
- Without `$request`, the response carries `Content-Type` + `Content-Disposition` only (no `Content-Length`, no
  `Accept-Ranges`).

```php
declare(strict_types=1);

namespace App\Presentation\Action\Invoice;

use Psr\Http\Message\ResponseInterface;
use Yiisoft\ResponseDownload\DownloadResponseFactory;

final readonly class DownloadInvoiceAction
{
    public function __construct(
        private DownloadResponseFactory $downloads,
        private InvoiceRepositoryInterface $invoices,
    ) {}

    public function __invoke(ServerRequestInterface $request): ResponseInterface
    {
        $invoice = $this->invoices->find($request->getAttribute('id'));
        if ($invoice === null) {
            return $this->responseFactory->createResponse(Status::NOT_FOUND);
        }

        return $this->downloads->sendFile(
            filePath: $invoice->getPdfPath(),
            attachmentName: "invoice-{$invoice->getNumber()}.pdf",
        );
    }
}
```

### 3.2. x-Sendfile Support

`xSendFile()` returns an **empty-body** response that delegates the actual file transfer to the web server: the
`$xHeader` carries the path (`Content-Disposition` and `Content-Type` are still set). Header name per server —
Apache: `X-Sendfile` (default), Lighttpd 1.4: `X-LIGHTTPD-send-file`, Nginx/FrankenPHP: `X-Accel-Redirect`:

```php
return $this->downloads->xSendFile(
    filePath: '/protected/reports/big.pdf',
    xHeader: 'X-Accel-Redirect', // Nginx / FrankenPHP
);
```

Use x-sendfile for large protected files — PHP does not read the file into memory at all.

### 3.3. Range Requests

Pass the current `ServerRequestInterface` as `$request` to `sendFile()` / `sendContentAsFile()` /
`sendStreamAsFile()`. When the stream size is known and the stream is seekable + readable, the factory sets
`Accept-Ranges: bytes` and `Content-Length`, and then:

| Client `Range` header | Result |
|---|---|
| Valid (`bytes=0-99`, suffix forms `bytes=N-`, `bytes=N-M`) | `206 Partial Content` + `Content-Range` + `ByteRangeStream` body |
| Unsatisfiable | `416` + `Content-Range: bytes */<size>` + empty body |
| Malformed / multiple ranges | ignored → full `200` response |

> [!NOTE]
> Range support is recent (CHANGELOG lists it under 1.1.1, in development at the time of writing). Verify the
> installed version's behavior in `vendor/yiisoft/response-download/src/DownloadResponseFactory.php` before
> relying on 206/416 responses.

## 4. File Uploads (PSR-7 + Validator)

No `yiisoft/*` package wraps the upload flow. The idiomatic pipeline:

1. **Extract** — uploaded files arrive as `Psr\Http\Message\UploadedFileInterface` from
   `$request->getUploadedFiles()` (or via the `#[UploadedFiles]` parameter attribute from `yiisoft/input-http`).
2. **Validate** — apply `Yiisoft\Validator\Rule\File\File` / `Rule\Image\Image` rules
   (exact constructor: verify in `vendor/yiisoft/validator/src/Rule/File.php` of the installed project):
   `__construct(array|string|null $extensions = null, array|string|null $mimeTypes = null, ?int $size = null, ?int $minSize = null, ?int $maxSize = null, bool $trustClientMediaType = false, /* messages */, bool|callable|null $skipOnEmpty = null, /* ... */)` —
   the `File` rule reads `UploadedFileInterface` error codes (`uploadFailedMessage`, `uploadRequiredMessage`).
3. **Move** — persist with `$uploadedFile->moveTo($destination)`; build the destination with
   `FileHelper::ensureDirectory()` + `normalizePath()`. Never move to the client-supplied
   `getClientFilename()` directly — generate your own sanitized name.
4. **Store metadata** — save the generated path/name through the repository, not just the file.

```php
declare(strict_types=1);

namespace App\Presentation\Action\Document;

use App\Application\Document\StoreDocumentUseCase;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Yiisoft\DataResponse\ResponseFactory\DataResponseFactoryInterface;
use Yiisoft\Files\FileHelper;
use Yiisoft\Http\Status;
use Yiisoft\Validator\Rule\File\File;
use Yiisoft\Validator\Rule\Required;
use Yiisoft\Validator\ValidatorInterface;

final readonly class UploadDocumentAction
{
    public function __construct(
        private ValidatorInterface $validator,
        private StoreDocumentUseCase $useCase,
        private DataResponseFactoryInterface $responseFactory,
        private string $uploadDir, // e.g. from params: '@uploads/documents'
    ) {}

    public function __invoke(ServerRequestInterface $request): ResponseInterface
    {
        $files = $request->getUploadedFiles();
        $uploaded = $files['document'] ?? null;

        $result = $this->validator->validate(
            $uploaded,
            ['document' => [new Required(), new File(extensions: ['pdf', 'docx'], maxSize: 10 * 1024 * 1024)]],
        );
        if (!$result->isValid()) {
            return $this->responseFactory->createResponse(
                ['status' => 'error', 'errors' => $result->getErrorMessagesIndexedByPath()],
                Status::UNPROCESSABLE_ENTITY,
            );
        }

        /** @var \Psr\Http\Message\UploadedFileInterface $uploaded */
        $filename = bin2hex(random_bytes(16)) . '.' . pathinfo($uploaded->getClientFilename() ?? '', PATHINFO_EXTENSION);
        FileHelper::ensureDirectory($this->uploadDir);
        $uploaded->moveTo(FileHelper::normalizePath("{$this->uploadDir}/{$filename}"));

        $this->useCase->handle($filename, $uploaded->getClientMediaType());

        return $this->responseFactory->createResponse(['status' => 'ok'], Status::CREATED);
    }
}
```

For images use `Yiisoft\Validator\Rule\Image\Image` (dimension constraints) alongside `File`.

## 5. Placement & Wiring

- Filesystem manipulation (moving, copying, cleanup) belongs in **infrastructure/services**, not in actions — an
  action validates and calls a use case; the use case delegates to a file-storage service that wraps `FileHelper`.
- Download responses are presentation concerns — injecting `DownloadResponseFactory` into an action is correct.
- Register `DownloadResponseFactory::class` explicitly in DI only if the container cannot autowire PSR-17
  factories; otherwise no definition is needed.
- Protected files must live **outside** `public/`; serve them via `sendFile()`/`xSendFile()` through an action,
  never by direct URL.

## 6. Anti-Pattern Matrix

| Forbidden Anti-Pattern | Why it breaks | Idiomatic Yii3 Solution |
|---|---|---|
| Calling `FileHelper::exists()` / `->touch()` / `pathCombine()` | These methods do not exist in `yiisoft/files` — fatal error | Use native `file_exists()`/`touch()`; combine paths with interpolation + `normalizePath()` |
| Treating `FileHelper` as an instance service | It is static-only, no constructor — DI autowiring has nothing to resolve | Call static methods; wrap your own storage service around them for testability |
| Moving uploads to `getClientFilename()` | Client-controlled path/filename — traversal and overwrites | Generate a server-side name; move with `$uploadedFile->moveTo()` (§4) |
| Skipping upload validation or trusting client MIME by default | `File` rule has `trustClientMediaType = false` by default for a reason — client MIME is spoofable | Validate with `File`/`Image` rules; enable `trustClientMediaType` only deliberately |
| Serving protected files from `public/` by direct URL | Bypasses auth/permission checks entirely | Store outside `public/`; stream through an action with `DownloadResponseFactory` |
| Reading large files into memory to send them | `sendContentAsFile()` with a huge string exhausts memory | Use `sendFile()` (streams from disk) or `sendStreamAsFile()`; use `xSendFile()` when the web server can serve |
| Inventing `DownloadResponseFactoryInterface` or `DownloadResponse` class | Neither exists — the factory is concrete and methods return plain `ResponseInterface` | Type-hint `Yiisoft\ResponseDownload\DownloadResponseFactory` |
| Hardcoding the x-sendfile header for your dev environment | Apache/Nginx/Lighttpd use different headers; wrong header leaks the response body empty | Pass `xHeader:` explicitly per environment (`X-Sendfile`, `X-Accel-Redirect`, `X-LIGHTTPD-send-file`) |
| Assuming `Content-Length` on every download response | Without `$request` the factory intentionally sets no `Content-Length`/`Accept-Ranges` | Pass the `ServerRequestInterface` when you need length + range support (§3.3) |
| Cleaning directories with `rm -rf` in code | No cross-platform guarantees, no filtering | `FileHelper::clearDirectory()` with a `PathMatcher` `filter` |
