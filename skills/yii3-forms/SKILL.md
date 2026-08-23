---
name: yii3-forms
description: >-
  User input workflow for Yii3 — forms, validation and file uploads: read parsed body (PSR-7),
  hydrate into FormModel/Input via yiisoft/form-model hydrator, validate with yiisoft/validator
  (rule catalog, attributes, rule sets, nested data, cross-field callbacks), handle uploaded files
  (File/Image rules, safe storage outside public root, downloads via yiisoft/response-download),
  then redirect-with-flash (PRG) or re-render errors, or return 422 for JSON APIs.
  Use when user says "handle form submit", "validate input", "add validation rule", "custom rule",
  "cross-field validation", "form errors", "flash message", "file upload", "avatar upload",
  "image upload", "attachment", "store uploaded file".
argument-hint: "[form|validation|upload task]"
allowed-tools: Read Glob Grep Write Edit Bash(php -l *; composer *) AskUserQuestion Questions
disable-model-invocation: false
metadata:
  author: DAGpro (https://github.com/DAGpro)
  version: "0.1"
  category: framework-yii3
---

# Yii3 Form Processing Workflow

Request → hydration → validation → response, including file fields. Packages:
`yiisoft/form-model` (FormModel + `FormHydrator`), `yiisoft/validator`, `yiisoft/session` (flash),
`yiisoft/request-body-parser` (JSON bodies), `yiisoft/response-download` (serving files).
Scaffolding new forms/actions: `/yii3-actions create|edit`. Widget rendering:
`/yii3-view` ("Form Widgets" section).

## Workflow

### Step 0: Detect Conventions

- How existing actions receive input: typed Input DTO (`CreateUserInput`) or FormModel +
  `FormHydrator::populateAndValidate()` — follow the project style.
- JSON bodies require `yiisoft/request-body-parser`; its middleware must run **before**
  `Router::class` so `getParsedBody()` returns decoded JSON.
- Flash rendering convention in templates (`$flash->get('success')` / `get('error')`).
- For upload forms: `enctype="multipart/form-data"` and PHP limits (`upload_max_filesize`,
  `post_max_size`) must cover the intended size.

### Step 1: Define Model + Rules (attributes)

```php
use Yiisoft\FormModel\FormModel;
use Yiisoft\Validator\Rule\Email;
use Yiisoft\Validator\Rule\Length;
use Yiisoft\Validator\Rule\Number;
use Yiisoft\Validator\Rule\Required;

final class PersonForm extends FormModel
{
    public function __construct(
        #[Required]
        #[Length(min: 2)]
        public ?string $name = null,
        #[Number(min: 21)]
        public ?int $age = null,
        #[Email]
        public ?string $email = null,
    ) {}
}
```

Attribute labels/hints (`Label`, `Hint` from form-model) are shared by Field widgets — prefer them
over repeating text in templates.

### Step 2: Hydrate + Validate in the Action

```php
public function __invoke(ServerRequestInterface $request): ResponseInterface
{
    $form = new PersonForm();
    $result = $this->formHydrator->populateAndValidate($form, $request->getParsedBody());

    if (!$result->isValid()) {
        // re-render form with populated values + errors (Step 4)
    }

    // success path → PRG redirect (Step 3)
}
```

For plain arrays/DTOs without a FormModel, validate explicitly:

```php
$result = $this->validator->validate($data, [
    'avatar' => [new File(extensions: ['jpg', 'png'], maxSize: 2 * 1024 * 1024)],
]);
```

### Step 3: Success Path — Redirect + Flash (PRG)

Always POST-Redirect-GET; never render HTML from a POST response:

```php
$this->session->getFlash()->add('success', 'Person saved.');
return $this->redirectFactory->createResponse('/people');
```

### Step 4: Error Path

Server-rendered forms: re-render the same template; the populated model renders values,
errors render automatically when the model was populated+validated before re-rendering;
add an `ErrorSummary` block. Field names MUST match model property names.

JSON APIs: return **422** with `$result->getErrorMessages()` (flat) or per-property messages;
see `/yii3-actions` references/API.md for the response shape.

## File Uploads

### Read + Validate Before Moving

```php
use Yiisoft\Validator\Rule\File;
use Yiisoft\Validator\Rule\Image\Image;

$files = $request->getUploadedFiles();   // shape mirrors form input names
$file = $files['avatar'] ?? null;

$result = (new Validator())->validate(
    ['avatar' => $file],
    [
        'avatar' => [
            new File(
                extensions: ['jpg', 'jpeg', 'png', 'webp'],
                mimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
                maxSize: 2 * 1024 * 1024,
            ),
            new Image(skipOnError: true),
        ],
    ],
);

if (!$result->isValid() || !$file instanceof \Psr\Http\Message\UploadedFileInterface) {
    return $this->jsonResponses->unprocessable($result->getPropertyErrorMessages('avatar'));
}
```

Multiple files per field: wrap in `Each(new File(...))`.

### Store Safely

```php
// generate your own name; store OUTSIDE the public dir unless intentionally public
$target = $this->aliases->get('@runtime/uploads') . '/' . bin2hex(random_bytes(16)) . '.png';
$file->moveTo($target);
```

Security rules:
- Never trust `getClientFilename()` / `getClientMediaType()` — both client-controlled.
- Always validate before moving; default storage to `@runtime`; expose through a controlled
  download action instead of symlinks (`DownloadResponseFactory`, `Content-Disposition: attachment`);
  resolve stored files by DB id → generated name mapping, never user-built paths.

Order: **validate → move → persist record**; on later failure, clean up the orphaned file.

## Rule Catalog (yiisoft/validator)

| Rule                                      | Purpose / key options                          |
|-------------------------------------------|------------------------------------------------|
| `Required`                                | value must not be empty (`when`, `message`)    |
| `FilledAtLeast(['a','b'])`                | at least one field filled (class-level)        |
| `Length(min:, max:)`                      | string length                                  |
| `Number(min:, max:, integer:)`            | numeric bounds / integer-only                  |
| `Email`, `Uuid`, `Url`, `Ip`, `Json`      | format checks                                  |
| `Regex(pattern:)`                         | custom pattern                                 |
| `In(values:)`, `Subset`                   | whitelists                                     |
| `Count(exactly:/min:/max:)`               | array size                                     |
| `Each(rule:)`                             | apply rule to every array item (files, ids...) |
| `Date(format: 'php:Y-m-d')`               | date parsing/format                            |
| `Boolean`, `TrueValue`                    | boolean checks                                 |
| `CompareTo(targetValue:, operator:)`      | compare with another value                     |
| `File(extensions:, mimeTypes:, maxSize:)` | PSR-7 uploads                                  |
| `Image(skipOnError:)`                     | image type/dimensions (extends File)           |
| `Callback(method:)`                       | application-specific logic                     |
| `Nested`                                  | nested object/array structure                  |

Check the installed package version — new rules appear over time; prefer a built-in rule over
`Callback`. Conditional execution: `when:` on most rules; `skipOnEmpty`, `skipOnError`.

## Cross-Field Validation

Class-level callback; attach error to a field path:

```php
#[Callback(method: 'validateDateRange')]
final class ReportFilterForm extends FormModel
{
    #[Required, Date(format: 'php:Y-m-d')]
    public string $dateFrom = '';

    #[Required, Date(format: 'php:Y-m-d')]
    public string $dateTo = '';

    public function validateDateRange(mixed $value, Callback $rule, ValidationContext $context): Result
    {
        $result = new Result();
        if ($this->dateFrom !== '' && $this->dateTo !== '' && $this->dateFrom > $this->dateTo) {
            $result->addError('The start date must be earlier than or equal to the end date.', [], ['dateFrom']);
        }
        return $result;
    }
}
```

Nested structures: `#[Nested]` for single objects, `#[Each(new Nested(rules: [...]))]` for lists.
Reused logic needed by several forms → Rule + Handler classes instead of copied callbacks
(handlers may resolve dependencies from DI).

## Rules

- One validation source of truth: rules live on the model; templates and API responses only render results.
- Client-side mirroring is optional — validator rule sets can be exported as option arrays for JS.
- Never trust client-side validation; server always re-validates.

## Verification Checklist

1. Valid submit persists + redirects; invalid submit re-renders with errors and old values.
2. Wrong extension / oversized / fake-mime uploads are rejected with field errors.
3. Download action serves stored files with correct headers and no path traversal.
4. JSON endpoints answer 422 with per-property messages.

## Related Skills

- `/yii3-actions` — generating actions/FormModels/Input DTOs (references/PATTERNS.md)
- `/yii3-view` — Field widget rendering for the forms processed here
