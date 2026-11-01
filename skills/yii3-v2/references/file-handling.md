# Yii3 File Handling Guide

> Practical guide for filesystem operations with `yiisoft/files`, file download responses with
> `yiisoft/response-download`, and the PSR-7 upload flow combined with `yiisoft/validator` file rules.

---

## Table of Contents
- [1. Package Map](#1-package-map)
- [2. Filesystem Utilities (`yiisoft/files`)](#2-filesystem-utilities-yiisoftfiles)
  - [2.1. FileHelper](#21-filehelper)
    - [2.1.1. Behavior on Missing Paths](#211-behavior-on-missing-paths)
    - [2.1.2. copyDirectory Options](#212-copydirectory-options)
  - [2.2. Path Matchers](#22-path-matchers)
- [3. Download Responses (`yiisoft/response-download`)](#3-download-responses-yiisoftresponse-download)
  - [3.1. Factory Methods](#31-factory-methods)
  - [3.2. x-Sendfile Support](#32-x-sendfile-support)
  - [3.3. Range Requests](#33-range-requests)
- [4. File Uploads (PSR-7 + Validator)](#4-file-uploads-psr-7--validator)
  - [4.1. Multi-File Upload (`Each`)](#41-multi-file-upload-each)
  - [4.2. Image Dimension Rules (`Rule\Image\Image`)](#42-image-dimension-rules-ruleimageimage)
- [5. Placement & Wiring](#5-placement--wiring)
- [6. Anti-Pattern Matrix](#6-anti-pattern-matrix)

---

## 1. Package Map

| Package | Role | Notes |
|---|---|---|
| `yiisoft/files` | Static filesystem utilities: directories, copying, deletion, path normalization, wildcard filtering | `Yiisoft\Files\FileHelper` + `PathMatcher\*` classes. **No** `File`/`Directory` objects, **no** upload helpers, **no** filename sanitizer. **Never resolves aliases** — resolve with `Yiisoft\Aliases\Aliases::get()` before any call (§2.2). |
| `yiisoft/response-download` | Factory for PSR-7 download responses (attachment/inline, x-sendfile, byte ranges) | `Yiisoft\ResponseDownload\DownloadResponseFactory`. **Concrete class, no factory interface exists.** |
| `yiisoft/validator` | Upload validation rules: `Yiisoft\Validator\Rule\File` (extensions, MIME, size), `Yiisoft\Validator\Rule\Image\Image` (dimensions) | The file rule is the **flat class** `Rule\File` — `Rule\File\File` does not exist. See [Validation & Forms Guide](validation-and-forms.md) §2.3. |
| `yiisoft/input-http` | `#[UploadedFiles]` parameter attribute to pull uploaded files into action arguments | See [Validation & Forms Guide](validation-and-forms.md) §8. |
| `yiisoft/http` | HTTP constants: `Yiisoft\Http\Status`, `Yiisoft\Http\Header`, `Yiisoft\Http\ContentDispositionHeader` (`ATTACHMENT` / `INLINE`) | Final constant-only classes. **No** `ContentType` or `StatusCode` classes exist. |
| `yiisoft/data-response` | Data/JSON responses: `Yiisoft\DataResponse\ResponseFactory\DataResponseFactoryInterface::createResponse(mixed $data = null, int $code = Status::OK, string $reasonPhrase = '')` | The data parameter is `mixed`, not `array`. Root-namespace `DataResponse*` classes are `@deprecated` — use `ResponseFactory\*`. |
| `yiisoft/aliases` | Alias resolution: `Yiisoft\Aliases\Aliases::get('@alias')` | `final`, **no interface** — inject the concrete class. Ships no predefined aliases; `@runtime` is defined by the app template, `@uploads` must be registered by the project (§5). |
| `yiisoft/strings` | Pattern engine behind `PathPattern` (`Yiisoft\Strings\WildcardPattern`) | `WildcardPattern` itself has **no** `caseSensitive()` / `onlyFiles()` / `onlyDirectories()` — those tuners belong to `Yiisoft\Files\PathMatcher\PathPattern`. |

PSR-7 upload consumption — `moveTo()`, `getClientFilename()`, `getClientMediaType()`, `getSize()`, `getError()`
on `Psr\Http\Message\UploadedFileInterface` — is **PSR-7 standard API**, not wrapped by any `yiisoft/*`
package. Actions handle it directly (§4).

## 2. Filesystem Utilities (`yiisoft/files`)

### 2.1. FileHelper

`Yiisoft\Files\FileHelper` is a **static-only** utility class (no constructor, no instance state). Complete public
static API (from `vendor/yiisoft/files/src/FileHelper.php`):

| Method | Purpose |
|---|---|
| `ensureDirectory(string $path, int $mode = 0775): void` | recursive `mkdir`; `chmod($path, $mode)` runs **unconditionally** — including for pre-existing directories (only the `mkdir` part is skipped) |
| `normalizePath(string $path): string` | `\` → `/`, collapses `//`, resolves `.` / `..` (Windows UNC `\\` prefix preserved) |
| `unlink(string $path): void` | cross-platform delete (chmod `0777` on non-writable Windows files); throws `RuntimeException` on failure, including a nonexistent path |
| `isEmptyDirectory(string $path): bool` | emptiness check |
| `removeDirectory(string $directory, array $options = []): void` | options: `traverseSymlinks` (default `false`) |
| `clearDirectory(string $directory, array $options = []): void` | empties the directory; options: `traverseSymlinks`, `filter` (a `PathMatcherInterface` — requires `yiisoft/files` 2.1.0+) |
| `copyDirectory(string $source, string $destination, array $options = []): void` | options in §2.1.2 |
| `copyFile(string $source, string $destination, array $options = []): void` | options: `dirMode` (default `0755`), `fileMode`, `beforeCopy`, `afterCopy` |
| `findFiles(string $directory, array $options = []): array` / `findDirectories(...): array` | returns `string[]`; options: `filter` (`PathMatcherInterface`), `recursive` (default `true`) |
| `lastModifiedTime(string\|RecursiveDirectoryIterator ...$paths): ?int` | latest mtime across paths |
| `openFile(string $filename, string $mode, bool $useIncludePath = false, $context = null)` | `fopen` wrapper; throws `RuntimeException` on failure |

> [!IMPORTANT]
> `FileHelper` has **no** `exists()`, `isSymlink()`, `touch()`, or `pathCombine()` methods — do not invent them.
> Use `file_exists()` / `is_file()` directly, and string interpolation or `normalizePath()` for combining paths.

#### 2.1.1. Behavior on Missing Paths

| Call with a nonexistent path | Behavior |
|---|---|
| `removeDirectory()` | silent no-op |
| `isEmptyDirectory()` | returns `false` |
| `findFiles()` / `findDirectories()` / `clearDirectory()` | `InvalidArgumentException` |
| `unlink()` | `RuntimeException` (also for a nonexistent path) |
| `lastModifiedTime()` called without arguments | `LogicException('Path is required.')` |

#### 2.1.2. copyDirectory options

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

Filtering for `findFiles()`, `findDirectories()`, `clearDirectory()` (and the `filter` option of
`copyDirectory()`) uses `Yiisoft\Files\PathMatcher\*`:

```php
use Yiisoft\Files\PathMatcher\CompositeMatcher;
use Yiisoft\Files\PathMatcher\PathMatcher;
use Yiisoft\Files\PathMatcher\PathPattern;

// String patterns: trailing '/' → matches directories only, otherwise files only.
// Matching is case-insensitive by default.
$filter = (new PathMatcher())
    ->only('*.php', 'bin/')            // keep these
    ->except('.git/', '*.lock');       // drop these

// PHP callbacks receive the full path and must return true for a match:
$smallFiles = (new PathMatcher())
    ->only('**.csv')
    ->callback(static fn (string $path): bool => filesize($path) < 1024 * 1024);

// PathPattern is a shell wildcard with its own tuners:
$jpgFiles = (new PathPattern('**.jpg'))
    ->onlyFiles()      // skip directories instead of matching them
    ->caseSensitive(); // default is case-insensitive

// Combine matcher instances (combinators do not accept string patterns):
$combined = CompositeMatcher::any($filter, $jpgFiles);

// FileHelper never resolves aliases — inject Yiisoft\Aliases\Aliases ($aliases) and resolve first:
$files = FileHelper::findFiles($aliases->get('@runtime/exports'), ['filter' => $combined]);
```

Semantics:

- Wildcards: `*` does not cross `/` boundaries, `**` does. A pattern without a leading `**` matches only from
  the start of the path — `'dir/*.jpg'` does **not** match `'var/dir/42.jpg'`; use `'**dir/*.jpg'`. `**` alone
  matches everything.
- `PathMatcher` is immutable and fluent: `only()`, `except()`, `callback()`, plus `caseSensitive()` and
  `doNotCheckFilesystem()` (match purely as strings — no `is_file()` / `is_dir()` checks).
- Return types: `PathMatcher::match(): bool`, while `PathMatcherInterface::match(string $path): ?bool` —
  `null` means "skipped (does not decide)". `PathPattern::match()` and `CompositeMatcher::match()` also return
  `?bool`; `null` occurs e.g. when `PathPattern::onlyFiles()` meets a directory.
- `CompositeMatcher::any(...$matchers)` / `CompositeMatcher::all(...$matchers)` accept `PathMatcherInterface`
  instances only — wrap string patterns in a `PathMatcher` / `PathPattern` first.

## 3. Download Responses (`yiisoft/response-download`)

Inject the concrete `Yiisoft\ResponseDownload\DownloadResponseFactory` (there is **no**
`DownloadResponseFactoryInterface`) — the package ships no `config/di.php`; the class requires two PSR-17
factories bound in the container:

```php
public function __construct(
    private readonly ResponseFactoryInterface $responseFactory, // Psr\Http\Message\ResponseFactoryInterface
    private readonly StreamFactoryInterface $streamFactory,     // Psr\Http\Message\StreamFactoryInterface
) {}
```

### 3.1. Factory Methods

All four methods return `Psr\Http\Message\ResponseInterface`. Verbatim signatures (from
`vendor/yiisoft/response-download/src/DownloadResponseFactory.php`):

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
  `InvalidArgumentException`. Resulting header value: `attachment; filename="report.pdf"`. Non-ASCII names
  additionally get `filename*=utf-8''<percent-encoded>`, and the `filename="..."` fallback replaces
  `%`, `/`, `\` with `_`.
- `sendFile()` / `xSendFile()` default `$attachmentName` to `basename($filePath)`; `sendContentAsFile()` /
  `sendStreamAsFile()` require the name.
- Without `$request`, the response carries `Content-Type` + `Content-Disposition` only (no `Content-Length`, no
  `Accept-Ranges`).
- `sendStreamAsFile()` never sniffs the MIME type — `$mimeType` is non-nullable with the
  `application/octet-stream` default; pass it explicitly.
- For `sendFile()` / `sendContentAsFile()` with `$mimeType = null`, the type is auto-detected via
  `finfo(FILEINFO_MIME_TYPE)` with an `application/octet-stream` fallback (available since 1.1.0). Detection of
  small plain payloads is PHP-version dependent — `'42'` is reported as `text/plain` only on PHP >= 8.3 — pass
  `$mimeType` explicitly when the exact type matters.

```php
// Generated content (attachment name is required; MIME sniffed from content when not passed):
return $this->downloads->sendContentAsFile(
    content: $csv,
    attachmentName: 'orders-2026-01.csv',
    mimeType: 'text/csv',
);

// Existing stream (streams are never MIME-sniffed — set the type explicitly when it matters):
return $this->downloads->sendStreamAsFile(
    stream: $stream,
    attachmentName: 'backup.zip',
    mimeType: 'application/zip',
);
```

```php
declare(strict_types=1);

namespace App\Presentation\Action\Invoice;

use Psr\Http\Message\ResponseFactoryInterface;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Yiisoft\Http\Status;
use Yiisoft\ResponseDownload\DownloadResponseFactory;

final readonly class DownloadInvoiceAction
{
    public function __construct(
        private ResponseFactoryInterface $responseFactory, // PSR-17, for plain status responses
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
Apache: `X-Sendfile` (default), Lighttpd 1.4: `X-LIGHTTPD-send-file`, Lighttpd 1.5: `X-Sendfile`,
Nginx/FrankenPHP: `X-Accel-Redirect`, Cherokee: `X-Sendfile` or `X-Accel-Redirect`:

```php
return $this->downloads->xSendFile(
    filePath: '/protected/reports/big.pdf',
    xHeader: 'X-Accel-Redirect', // Nginx / FrankenPHP
);
```

Use x-sendfile for large protected files — PHP does not read the file into memory at all. `xSendFile()` takes no
`$request` parameter — range handling is delegated to the web server.

Two behavioral notes (from the package source):

- `sendFile()` on a missing file throws `RuntimeException` (from the PSR-17 stream factory); `xSendFile()` on a
  missing file returns a normal response with `Content-Type: application/octet-stream` — the server does the
  I/O, so there is nothing to fail in PHP.
- If the web-server feature is disabled (module not enabled, wrong header), the browser download dialog opens
  with a 0-byte file.

### 3.3. Range Requests

Pass the current `ServerRequestInterface` as `$request` to `sendFile()` / `sendContentAsFile()` /
`sendStreamAsFile()`. When the stream size is known and the stream is seekable + readable, the factory rewinds
the stream and sets `Accept-Ranges: bytes` and `Content-Length` — **even when the client sent no `Range`
header** — and then:

| Client `Range` header | Result |
|---|---|
| Valid (`bytes=0-99`, suffix forms `bytes=N-`, `bytes=N-M`) | `206` (`Yiisoft\Http\Status::PARTIAL_CONTENT`) + `Content-Range` + `ByteRangeStream` body (an `@internal` package class — not public API) |
| Unsatisfiable | `416` (`Status::RANGE_UNSATISFIABLE`) + `Content-Range: bytes */<size>` + empty body |
| Malformed / multiple ranges | ignored → full `200` response (single ranges only) |

> [!NOTE]
> Range support is recent (CHANGELOG lists it under 1.1.1, in development at the time of writing). Verify the
> installed version's behavior in `vendor/yiisoft/response-download/src/DownloadResponseFactory.php` before
> relying on 206/416 responses.

## 4. File Uploads (PSR-7 + Validator)

No `yiisoft/*` package wraps the upload flow. The idiomatic pipeline:

1. **Extract** — uploaded files arrive as `Psr\Http\Message\UploadedFileInterface` (PSR-7) from
   `$request->getUploadedFiles()` (or via the `#[UploadedFiles]` parameter attribute from `yiisoft/input-http`).
   The attribute passes the raw map value through as-is: a `UploadedFileInterface`-typed property receives one
   element, an `array`-typed property receives the whole list; dot-paths address nested upload maps. A missing
   path is fail-soft — the property keeps its default, nothing is thrown. Native `$_FILES` arrays are **not**
   accepted by the validator — convert to PSR-7 upload objects first; `php://input` body streams are not
   supported either.
2. **Validate** — apply `Yiisoft\Validator\Rule\File` (extensions, MIME, size) and/or
   `Yiisoft\Validator\Rule\Image\Image` (dimensions, §4.2). The rule is `final`, usable as a PHP attribute, and
   validates string paths, `SplFileInfo`, and PSR-7 `UploadedFileInterface` values. Full constructor (from
   `vendor/yiisoft/validator/src/Rule/File.php`):

```php
public function __construct(
    array|string|null $extensions = null,
    array|string|null $mimeTypes = null,
    ?int $size = null,
    ?int $minSize = null,
    ?int $maxSize = null,
    bool $trustClientMediaType = false,
    string $message = '{Property} must be a file.',
    string $uploadFailedMessage = 'Failed to upload {property}. Error code: {error, number}.',
    string $uploadRequiredMessage = 'Please upload a file.',
    string $wrongExtensionMessage = 'Only files with these extensions are allowed: {extensions}.',
    string $wrongMimeTypeMessage = 'Only files with these MIME types are allowed: {mimeTypes}.',
    string $notExactSizeMessage = 'The size of {property} must be exactly {exactly, number} {exactly, plural, one{byte} other{bytes}}.',
    string $tooSmallMessage = 'The size of {property} cannot be smaller than {limit, number} {limit, plural, one{byte} other{bytes}}.',
    string $tooBigMessage = 'The size of {property} cannot be larger than {limit, number} {limit, plural, one{byte} other{bytes}}.',
    string $unableToDetermineSizeMessage = 'The size of {property} cannot be determined.',
    bool|callable|null $skipOnEmpty = null,
    bool $skipOnError = false,
    ?Closure $when = null,
)
```

- Exact `size` is mutually exclusive with `minSize` / `maxSize` (`InvalidArgumentException`); negative sizes and
  `minSize > maxSize` are rejected.
- Upload error pipeline: `UPLOAD_ERR_NO_FILE` → `uploadRequiredMessage`; any other non-OK error →
  `uploadFailedMessage`, with `{error}` carrying the numeric PHP upload error code.
- Optional uploads: `new File(skipOnEmpty: true)` treats `UPLOAD_ERR_NO_FILE` as "empty".
- `extensions` / `mimeTypes` accept `array|string` (string = comma/space separated), support MIME wildcards like
  `image/*`, and are lowercased/deduplicated. A file **without an extension fails** when `extensions` is
  configured.

> [!WARNING]
> `trustClientMediaType` defaults to `false`. For a pathless / in-memory `UploadedFileInterface` there is no
> real file on disk to sniff: the client media type is used only when `trustClientMediaType` is enabled,
> otherwise MIME validation fails. Client MIME is spoofable — enable it only deliberately.

> [!NOTE]
> The `File` rule also accepts string paths and `SplFileInfo` — that does not prove HTTP-upload provenance.
> Never pass user-submitted paths into it.

Validation-call semantics — string keys in the rules map address **properties of the validated data**:

```php
// Whole-value validation (rules in a flat list):
$result = $this->validator->validate($uploaded, [new Required(), new File(extensions: ['pdf'])]);

// Named field — the key must exist in the data AND in the rules map:
$result = $this->validator->validate(
    ['document' => $uploaded],
    ['document' => [new Required(), new File(extensions: ['pdf'])]],
);
```

> [!IMPORTANT]
> `validate($uploaded, ['document' => [...]])` — a bare upload under a string-keyed rules map — always fails
> `Required`: the validator reads a non-existent `document` property (`null`) from the wrapped upload object.

3. **Move** — check `$uploaded->getError() === UPLOAD_ERR_OK` first (PSR-7; the `File` rule already reports
   non-OK codes as validation errors), then persist with `$uploadedFile->moveTo($destination)`. Build the
   destination with `FileHelper::ensureDirectory()` + `normalizePath()`, resolving any alias with
   `Yiisoft\Aliases\Aliases::get()` first — `FileHelper` never resolves aliases. Never move to the
   client-supplied `getClientFilename()` directly — generate your own server-side name.
4. **Store metadata** — save the generated path/name through the repository, not just the file.

```php
declare(strict_types=1);

namespace App\Presentation\Action\Document;

use App\Application\Document\StoreDocumentUseCase;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Yiisoft\Aliases\Aliases;
use Yiisoft\DataResponse\ResponseFactory\DataResponseFactoryInterface;
use Yiisoft\Files\FileHelper;
use Yiisoft\Http\Status;
use Yiisoft\Validator\Rule\File;
use Yiisoft\Validator\Rule\Required;
use Yiisoft\Validator\ValidatorInterface;

final readonly class UploadDocumentAction
{
    public function __construct(
        private ValidatorInterface $validator,
        private StoreDocumentUseCase $useCase,
        private DataResponseFactoryInterface $responseFactory,
        private Aliases $aliases,
        private string $uploadDir, // e.g. from params: '@uploads/documents'
    ) {}

    public function __invoke(ServerRequestInterface $request): ResponseInterface
    {
        $files = $request->getUploadedFiles();
        $uploaded = $files['document'] ?? null;

        // String-keyed rules require the same key in the data set:
        $result = $this->validator->validate(
            ['document' => $uploaded],
            ['document' => [new Required(), new File(extensions: ['pdf', 'docx'], maxSize: 10 * 1024 * 1024)]],
        );
        if (!$result->isValid()) {
            return $this->responseFactory->createResponse(
                ['status' => 'error', 'errors' => $result->getErrorMessagesIndexedByPath()],
                Status::UNPROCESSABLE_ENTITY,
            );
        }

        /** @var \Psr\Http\Message\UploadedFileInterface $uploaded */
        if ($uploaded->getError() !== UPLOAD_ERR_OK) {
            return $this->responseFactory->createResponse(
                ['status' => 'error', 'errors' => ['document' => 'Upload failed.']],
                Status::UNPROCESSABLE_ENTITY,
            );
        }

        // FileHelper never resolves aliases — '@uploads/...' must go through Aliases::get() first:
        $dir = FileHelper::normalizePath($this->aliases->get($this->uploadDir));
        FileHelper::ensureDirectory($dir); // chmod($dir, 0775) runs even when the dir already exists

        $filename = bin2hex(random_bytes(16)) . '.' . pathinfo($uploaded->getClientFilename() ?? '', PATHINFO_EXTENSION);
        $uploaded->moveTo("{$dir}/{$filename}");

        $this->useCase->handle($filename, $uploaded->getClientMediaType());

        return $this->responseFactory->createResponse(['status' => 'ok'], Status::CREATED);
    }
}
```

`Yiisoft\DataResponse\ResponseFactory\DataResponseFactoryInterface::createResponse()` has the signature
`createResponse(mixed $data = null, int $code = Status::OK, string $reasonPhrase = ''): ResponseInterface` —
the data parameter is `mixed` (arrays are fine), not `array`.

### 4.1. Multi-File Upload (`Each`)

For a list of uploads apply the rule to every element with `Yiisoft\Validator\Rule\Each`:

```php
use Yiisoft\Validator\Rule\Each;

$result = $this->validator->validate(
    ['attachments' => $request->getUploadedFiles()],
    ['attachments' => new Each(new File(maxSize: 5_000_000))],
);
```

### 4.2. Image Dimension Rules (`Rule\Image\Image`)

`Yiisoft\Validator\Rule\Image\Image` checks dimensions alongside the `File` rule (constructor from
`vendor/yiisoft/validator/src/Rule/Image/Image.php`):

```php
use Yiisoft\Validator\Rule\Image\Image;
use Yiisoft\Validator\Rule\Image\ImageAspectRatio;

// Exact width/height are mutually exclusive with their min/max counterparts.
new Image(
    minWidth: 100,
    maxWidth: 2000,
    aspectRatio: new ImageAspectRatio(16, 9), // int $width, int $height, float $margin = 0
);
```

- Constructor parameters: `?int $width`, `?int $height`, `?int $minWidth`, `?int $minHeight`, `?int $maxWidth`,
  `?int $maxHeight`, `?ImageAspectRatio $aspectRatio`, message parameters, then
  `skipOnEmpty` / `skipOnError` / `when`. Exact `width` / `height` are mutually exclusive with their min/max
  counterparts (`InvalidArgumentException`).
- A bare `new Image()` is an "is an image" check only — dimensions are validated when a constraint is set.
- For `UploadedFileInterface` the handler requires `getError() === UPLOAD_ERR_OK` and reads the temp path from
  the stream metadata.
- Dimension checks rely on `getimagesize()` — HEIF/HEIC images are not supported.

## 5. Placement & Wiring

- Filesystem manipulation (moving, copying, cleanup) belongs in **infrastructure/services**, not in actions — an
  action validates and calls a use case; the use case delegates to a file-storage service that wraps `FileHelper`:

```php
declare(strict_types=1);

namespace App\Infrastructure\FileStorage;

use Psr\Http\Message\UploadedFileInterface;
use Yiisoft\Aliases\Aliases;
use Yiisoft\Files\FileHelper;

final readonly class DocumentStorage
{
    public function __construct(
        private Aliases $aliases,
        private string $uploadDir, // param value: '@uploads/documents'
    ) {}

    public function save(UploadedFileInterface $upload, string $generatedName): string
    {
        $dir = FileHelper::normalizePath($this->aliases->get($this->uploadDir));
        FileHelper::ensureDirectory($dir); // chmod($dir, 0775) runs even when the dir already exists
        $upload->moveTo("{$dir}/{$generatedName}");
        return "{$dir}/{$generatedName}";
    }
}
```

  Aliases are resolved once at the service boundary — `@uploads` is **not** predefined by any package, register
  it in project params (`@runtime` is predefined by the app template as `@root/runtime`):

```php
// config/common/params.php
return [
    'yiisoft/aliases' => [
        'aliases' => [
            '@uploads' => '@root/public/uploads',
        ],
    ],
];
```

- Download responses are presentation concerns — injecting `DownloadResponseFactory` into an action is correct.
- Register `DownloadResponseFactory::class` explicitly in DI only if the container cannot autowire PSR-17
  factories; otherwise no definition is needed:

```php
// config/common/di.php — fallback definition (PSR-17 bindings are normally already present)
use Psr\Http\Message\ResponseFactoryInterface;
use Psr\Http\Message\StreamFactoryInterface;
use Yiisoft\Definitions\Reference;
use Yiisoft\ResponseDownload\DownloadResponseFactory;

return [
    DownloadResponseFactory::class => [
        '__construct()' => [
            Reference::to(ResponseFactoryInterface::class),
            Reference::to(StreamFactoryInterface::class),
        ],
    ],
];
```

- Protected files must live **outside** `public/`; serve them via `sendFile()`/`xSendFile()` through an action,
  never by direct URL.

## 6. Anti-Pattern Matrix

| Forbidden Anti-Pattern | Why it breaks | Idiomatic Yii3 Solution |
|---|---|---|
| Calling `FileHelper::exists()` / `->touch()` / `pathCombine()` | These methods do not exist in `yiisoft/files` — fatal error | Use native `file_exists()`/`touch()`; combine paths with interpolation + `normalizePath()` |
| Treating `FileHelper` as an instance service | It is static-only, no constructor — DI autowiring has nothing to resolve | Call static methods; wrap your own storage service around them for testability |
| Passing alias strings (`'@runtime/...'`, `'@uploads/...'`) into `FileHelper` methods | `FileHelper` never resolves aliases — the literal string is used as a path and fails with `InvalidArgumentException("... does not exist.")` | Inject `Yiisoft\Aliases\Aliases` and call `$aliases->get('@uploads/...')` first (§5) |
| `validate($upload, ['field' => [...]])` on a bare upload | String-keyed rules read a property from the validated value — a bare `UploadedFileInterface` has none, so `Required` always fails | Key the data too: `validate(['field' => $upload], ['field' => [...]])` (§4) |
| Moving uploads to `getClientFilename()` | Client-controlled path/filename — traversal and overwrites | Generate a server-side name; move with `$uploadedFile->moveTo()` (§4) |
| Skipping upload validation or trusting client MIME by default | `File` rule has `trustClientMediaType = false` by default for a reason — client MIME is spoofable | Validate with `File`/`Image` rules; enable `trustClientMediaType` only deliberately |
| Serving protected files from `public/` by direct URL | Bypasses auth/permission checks entirely | Store outside `public/`; stream through an action with `DownloadResponseFactory` |
| Reading large files into memory to send them | `sendContentAsFile()` with a huge string exhausts memory | Use `sendFile()` (streams from disk) or `sendStreamAsFile()`; use `xSendFile()` when the web server can serve |
| Inventing `DownloadResponseFactoryInterface` or `DownloadResponse` class | Neither exists — the factory is concrete and methods return plain `ResponseInterface` | Type-hint `Yiisoft\ResponseDownload\DownloadResponseFactory` |
| Hardcoding the x-sendfile header for your dev environment | Apache/Nginx/Lighttpd use different headers; with the feature disabled the download dialog opens a 0-byte file | Pass `xHeader:` explicitly per environment (`X-Sendfile`, `X-Accel-Redirect`, `X-LIGHTTPD-send-file`) |
| Assuming `Content-Length` on every download response | Without `$request` the factory intentionally sets no `Content-Length`/`Accept-Ranges` | Pass the `ServerRequestInterface` when you need length + range support (§3.3) |
| Cleaning directories with `rm -rf` in code | No cross-platform guarantees, no filtering | `FileHelper::clearDirectory()` with a `PathMatcher` `filter` |

---

## Related Topic Guides

- [Utility Packages Guide](utilities.md) — `ArrayHelper`, `StringHelper`, `Json`, `VarDumper`, `Classifier`, and IP/DNS helpers.
