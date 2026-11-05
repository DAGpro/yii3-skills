# Yii3 Validation Rules: Custom Rules, Files, Cross-Property & Messages

> [!IMPORTANT]
> **Grounding rule:** sources of truth are split by question type — API: installed `vendor/yiisoft/<pkg>/src/` (versions via `composer.lock`); implementation patterns: this guide; project conventions: the project's architecture artifact or dominant `src/` style. Full table and conflict rule: SKILL.md Core rule 2.

> Part of the [Validation & Forms Guide](http-validation-and-forms.md) split — the index, decision matrix, anti-pattern matrix, and related guides live there. Dedicated custom-rules walkthrough: [Custom Validation Rules Guide](http-validation-custom-rules.md).

## 4. Custom Rules & Rule Handlers

In Yii 3, custom validation rules follow a decoupled architecture separating configuration (`RuleInterface`, PHP 8 `#[Attribute]`) from execution services (`RuleHandlerInterface`), and require explicit DI configuration via `RuleHandlerContainer`.

For complete recipes, interface implementation details (`DumpedRuleInterface`, `SkipOnEmptyInterface`, `WhenInterface`), cross-property validation via `ValidationContext`, compound composite rules (`Rule\Composite`), one-off checks with `Rule\Callback`, and isolated unit and integration testing suites, see the dedicated reference guide:

&rarr; **[Custom Validation Rules & Testing Guide](http-validation-custom-rules.md)**

---

## 5. File & Image Validation

### 5.1. File Rule & Safe Post-Validation Storage

The file validation rule resides in the root rule namespace: `Yiisoft\Validator\Rule\File` (`vendor/yiisoft/validator/src/Rule/File.php`).

`File` validates:
- Local filesystem paths (`string`).
- Standard PHP `SplFileInfo` objects.
- PSR-7 `Psr\Http\Message\UploadedFileInterface` instances.

```php
declare(strict_types=1);

namespace App\Application\Document\Dto;

use Psr\Http\Message\UploadedFileInterface;
use Yiisoft\Validator\Label;
use Yiisoft\Validator\Rule\File;
use Yiisoft\Validator\Rule\Required;

final class UploadDocumentInput
{
    #[Label('Contract PDF')]
    #[Required]
    #[File(
        extensions: ['pdf'],
        mimeTypes: ['application/pdf'],
        minSize: 10 * 1024,           // 10 KB
        maxSize: 15 * 1024 * 1024,     // 15 MB
        message: 'Please provide a valid file.',
        tooBigMessage: 'The file {property} cannot exceed 15 MB.',
    )]
    public ?UploadedFileInterface $document = null;
}
```

**Complete constructor** (verbatim, `vendor/yiisoft/validator/src/Rule/File.php` — the §2.3 catalog row above lists the core options; the message parameters complete the signature):

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

- Exact `size` is mutually exclusive with `minSize` / `maxSize` (`InvalidArgumentException`); negative sizes and `minSize > maxSize` are rejected.
- Upload error pipeline: `UPLOAD_ERR_NO_FILE` → `uploadRequiredMessage`; any other non-OK error → `uploadFailedMessage`, with `{error}` carrying the numeric PHP upload error code.
- Optional uploads: `new File(skipOnEmpty: true)` treats `UPLOAD_ERR_NO_FILE` as "empty".
- `extensions` / `mimeTypes` accept `array|string` (string = comma/space separated), support MIME wildcards like `image/*`, and are lowercased/deduplicated. A file **without an extension fails** when `extensions` is configured.

> [!WARNING]
> `trustClientMediaType` defaults to `false`. For a pathless / in-memory `UploadedFileInterface` there is no
> real file on disk to sniff: the client media type is used only when `trustClientMediaType` is enabled,
> otherwise MIME validation fails. Client MIME is spoofable — enable it only deliberately.

> [!NOTE]
> The `File` rule also accepts string paths and `SplFileInfo` — that does not prove HTTP-upload provenance.
> Never pass user-submitted paths into it.

**Validation-call semantics** — string keys in the rules map address **properties of the validated data**:

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

> [!TIP]
> **Post-Validation File Persistence Reference:**
> After validation, persist the uploaded file with `$uploadedFile->moveTo()`. For directory creation (`FileHelper::ensureDirectory()`), alias resolution, filename generation, and storage-service placement, see the [File Handling Guide, §4](http-file-handling.md#4-file-uploads-psr-7--validator) and [§5](http-file-handling.md#5-placement--wiring).

### 5.2. Image & Aspect Ratio Rules (`Rule\Image\Image`, `ImageAspectRatio`)

Image rules are housed in `Yiisoft\Validator\Rule\Image\*`:
- `Yiisoft\Validator\Rule\Image\Image` checks dimensions (width and height limits in pixels). Requires PHP `ext-gd`.
- `Yiisoft\Validator\Rule\Image\ImageAspectRatio` is a companion value object validating aspect ratios with an allowed tolerance margin.

```php
declare(strict_types=1);

namespace App\Application\Profile\Dto;

use Psr\Http\Message\UploadedFileInterface;
use Yiisoft\Validator\Label;
use Yiisoft\Validator\Rule\File;
use Yiisoft\Validator\Rule\Image\Image;
use Yiisoft\Validator\Rule\Image\ImageAspectRatio;
use Yiisoft\Validator\Rule\Required;

final class UpdateAvatarInput
{
    #[Label('Profile Picture')]
    #[Required]
    #[File(
        extensions: ['jpg', 'jpeg', 'png', 'webp'],
        mimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
        maxSize: 2 * 1024 * 1024,
    )]
    #[Image(
        minWidth: 200,
        minHeight: 200,
        maxWidth: 2000,
        maxHeight: 2000,
        aspectRatio: new ImageAspectRatio(width: 1, height: 1, margin: 5.0), // 1:1 ±5% margin
    )]
    public ?UploadedFileInterface $avatar = null;
}
```

Constructor options and behavioral traps (from `vendor/yiisoft/validator/src/Rule/Image/Image.php`):

- Constructor parameters: `?int $width`, `?int $height`, `?int $minWidth`, `?int $minHeight`, `?int $maxWidth`, `?int $maxHeight`, `?ImageAspectRatio $aspectRatio`, message parameters, then `skipOnEmpty` / `skipOnError` / `when`. Exact `width` / `height` are mutually exclusive with their min/max counterparts (`InvalidArgumentException`).
- A bare `new Image()` is an "is an image" check only — dimensions are validated when a constraint is set.
- For `UploadedFileInterface` the handler requires `getError() === UPLOAD_ERR_OK` and reads the temp path from the stream metadata.
- Dimension checks rely on `getimagesize()` — HEIF/HEIC images are not supported.

### 5.3. Validating PSR-7 UploadedFileInterface & Multi-File Collections

When receiving an array of uploaded files, wrap `File` or `Image` inside `Each`:

```php
declare(strict_types=1);

namespace App\Application\Gallery\Dto;

use Psr\Http\Message\UploadedFileInterface;
use Yiisoft\Input\Http\Attribute\Parameter\UploadedFiles;
use Yiisoft\Validator\Rule\Count;
use Yiisoft\Validator\Rule\Each;
use Yiisoft\Validator\Rule\File;
use Yiisoft\Validator\Rule\Image\Image;
use Yiisoft\Validator\Rule\Required;

final class UploadGalleryInput
{
    /**
     * @var array<UploadedFileInterface>
     */
    #[UploadedFiles('gallery_images')]
    #[Required]
    #[Count(min: 1, max: 10)]
    #[Each([
        new File(extensions: ['jpg', 'png'], maxSize: 5 * 1024 * 1024),
        new Image(minWidth: 800, minHeight: 600),
    ])]
    public array $images = [];
}
```

---

## 6. Cross-Property Validation & Contextual Comparison

### 6.1. Comparison Rules: targetProperty vs. targetValue

All comparison rules (`Equal`, `NotEqual`, `GreaterThan`, `GreaterThanOrEqual`, `LessThan`, `LessThanOrEqual`, `Compare`) inherit from `Yiisoft\Validator\Rule\AbstractCompare`.

- To compare against a static scalar: use `targetValue: 100`.
- To compare against a sibling property in the dataset: use `targetProperty: 'otherPropertyName'`.

> [!WARNING]
> In Yii 3, the target field parameter is named **`targetProperty`**. Using `targetAttribute`, `target`, or `property` causes an `Error: Unknown named parameter` in PHP 8.

```php
declare(strict_types=1);

namespace App\Application\Auth\Dto;

use Yiisoft\Validator\Label;
use Yiisoft\Validator\Rule\Equal;
use Yiisoft\Validator\Rule\Length;
use Yiisoft\Validator\Rule\Required;

final class RegisterInput
{
    #[Label('Password')]
    #[Required]
    #[Length(min: 8)]
    public string $password = '';

    #[Label('Password Confirmation')]
    #[Required]
    #[Equal(
        targetProperty: 'password',
        message: '{Property} must match {targetProperty}.',
    )]
    public string $passwordRepeat = '';
}
```

Available message placeholders in comparison rules:
- `{property}` / `{Property}` — validated property name.
- `{targetProperty}` / `{TargetProperty}` — target property name.
- `{targetValue}` — static target value.
- `{targetPropertyValue}` — resolved value of the target property.
- `{targetValueOrProperty}` — resolved property value or static target value.

### 6.2. Cross-Property Cardinality: FilledAtLeast, FilledOnlyOneOf

Use cross-property cardinality rules when multiple properties must be validated in relation to each other:

```php
declare(strict_types=1);

namespace App\Application\Notification\Dto;

use Yiisoft\Validator\Rule\Email;
use Yiisoft\Validator\Rule\FilledAtLeast;
use Yiisoft\Validator\Rule\FilledOnlyOneOf;
use Yiisoft\Validator\Rule\Regex;

#[FilledAtLeast(
    properties: ['mobilePhone', 'emailAddress'],
    min: 1,
    message: 'At least one contact method must be provided.',
)]
#[FilledOnlyOneOf(
    properties: ['discountPercentage', 'fixedDiscountAmount'],
    message: 'Specify either a percentage discount or a fixed discount, not both.',
)]
final class CustomerPreferencesInput
{
    #[Regex(pattern: '/^\+?[1-9]\d{1,14}$/')]
    public ?string $mobilePhone = null;

    #[Email]
    public ?string $emailAddress = null;

    public ?int $discountPercentage = null;
    public ?float $fixedDiscountAmount = null;
}
```

### 6.3. Dynamic Context Inspection via ValidationContext

Within custom rules or callbacks, inspect the enclosing dataset via `$context->getDataSet()`:

```php
$dataset = $context->getDataSet();
$userRole = $dataset->getPropertyValue('role');
$accountType = $dataset->getPropertyValue('accountType');
```

---

## 7. Messages, Labels, Placeholders & Internationalization

### 7.1. Translation Category 'yii-validator' & TranslatorMessagePhp Requirement

All built-in error messages in `yiisoft/validator` are translated using `Yiisoft\Translator\TranslatorInterface` under the default category **`'yii-validator'`** (`Yiisoft\Validator\Validator::DEFAULT_TRANSLATION_CATEGORY`).

The package ships official translations in `vendor/yiisoft/validator/messages/<locale>/yii-validator.php` (e.g. Russian, German, French, Spanish, Ukrainian).

> [!IMPORTANT]
> **Mandatory Dependency: `yiisoft/translator-message-php`**
> In `vendor/yiisoft/validator/config/di.php`, the category source definition checks:
> ```php
> $reader = class_exists(MessageSource::class)
>     ? new MessageSource(\dirname(__DIR__) . '/messages')
>     : new IdMessageReader();
> ```
> If `yiisoft/translator-message-php` is missing from `composer.json`, `class_exists(MessageSource::class)` returns `false`. The validator falls back to `IdMessageReader`, leaving all system error messages untranslated even if the application locale is configured. Always install:
> ```bash
> composer require yiisoft/translator-message-php
> ```

Application DI configuration (`config/common/di/validator.php`):
```php
declare(strict_types=1);

use Yiisoft\Validator\Validator;
use Yiisoft\Validator\ValidatorInterface;

return [
    ValidatorInterface::class => [
        'class' => Validator::class,
        '__construct()' => [
            'translationCategory' => 'yii-validator',
        ],
    ],
];
```

### 7.2. Placeholder Substitution: {Property}, {value}, and Parameter Tokens

Placeholders use curly braces and match parameter arrays passed to `$result->addError()`:
- `{Property}` — capitalized translated property name (e.g. `"Publication Title"`).
- `{property}` — lowercase translated property name (e.g. `"publication title"`).
- `{value}` — scalar value that failed validation.
- Numerical limits: `{min}`, `{max}`, `{exactly}`, `{limit}`.

### 7.3. Property Labels via #[Label] and Property Translators

Property names in error messages default to camelCase property identifiers. To supply human-readable labels, decorate properties with `#[\Yiisoft\Validator\Label('...')]`:

```php
declare(strict_types=1);

namespace App\Application\Article\Dto;

use Yiisoft\Validator\Label;
use Yiisoft\Validator\Rule\Length;
use Yiisoft\Validator\Rule\Required;

final class ArticleInput
{
    #[Label('Article Headline')]
    #[Required]
    #[Length(min: 5, max: 200)]
    public string $headline = '';
}
```

> [!IMPORTANT]
> The `#[Label]` attribute belongs to **`Yiisoft\Validator\Label`**, NOT `yiisoft/form-model`.

#### Property Translators
Dynamic label resolution can also be customized via `PropertyTranslatorInterface`:
- `Yiisoft\Validator\PropertyTranslator\NullPropertyTranslator` — returns the raw property name untouched.
- `Yiisoft\Validator\PropertyTranslator\ArrayPropertyTranslator` — translates using a static map: `new ArrayPropertyTranslator(['title' => 'Article Title'])`.
- `Yiisoft\Validator\PropertyTranslator\TranslatorPropertyTranslator` — delegates property name translation to `Yiisoft\Translator\TranslatorInterface`.

*(Note: There is no `SimplePropertyTranslator` in Yii 3; using it causes a fatal class not found error).*

### 7.4. Message Formatters: SimpleMessageFormatter vs. IntlMessageFormatter

When configuring `yiisoft/translator`:
- **`SimpleMessageFormatter`:** Replaces tokens via string substitution and supports basic binary pluralization (`one` and `other`). It throws `InvalidArgumentException` if any `{param}` token in the template is absent from parameters.
- **`IntlMessageFormatter`:** Uses PHP's `ext-intl` and ICU MessageFormat. It is **mandatory** for languages with complex plural rules (such as Russian, Polish, Czech with `one`, `few`, `many`, `other`). In ICU templates, escape literal curly braces with single quotes: `'{'`.

---
