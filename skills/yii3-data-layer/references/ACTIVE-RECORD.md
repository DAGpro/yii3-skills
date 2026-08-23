# Yii3 Active Record (yiisoft/active-record)

Use `yiisoft/active-record` when the project prefers AR over hand-written repositories.
**Default recommendation for new Yii3 apps remains repository over `yiisoft/db` (see
`yii3-actions` (references/CRUD.md)) — follow this reference only if the project already
uses AR or explicitly requests it.**

## Step 0: Setup Check

1. `composer require yiisoft/active-record` (+ a `yiisoft/db-*` driver).
2. A `ConnectionInterface` must be configured (see the Connection section of SKILL.md).
3. Define the connection for Active Record per package docs (`docs/define-connection.md`):
   register the AR connection service so `ActiveRecord` knows which connection to use.

## Step 1: Model Class

Typed properties version:

```php
<?php

declare(strict_types=1);

namespace App\Web\Post;

use Yiisoft\ActiveRecord\ActiveRecord;

final class Post extends ActiveRecord
{
    public int $id;
    public string $title;
    public string $slug;
    public string $text;
    public string $status = 'draft';

    public function tableName(): string
    {
        return '{{%post}}';
    }
}
```

Fast prototyping with dynamic properties:

```php
/**
 * @property int $id
 * @property string $title
 * @property string $slug
 */
#[\AllowDynamicProperties]
final class Post extends \Yiisoft\ActiveRecord\ActiveRecord
{
}
```

## Step 2: CRUD Operations

```php
// create
$post = new Post();
$post->title = 'Hello';
$post->slug = 'hello';
$post->save();

// read one by PK
$post = Post::query()->findByPk(1);

// read by condition
$posts = Post::query()->where(['status' => 'published'])->all();
$post = Post::query()->where(['slug' => 'hello'])->one();

// update
$post->title = 'Hello v2';
$post->save();

// delete
$post->delete();
```

## Step 3: Relations

Define relation methods per package docs (`docs/define-relations.md`) — e.g. `Post::getComments()`
linking to a `Comment` AR via FK. Access lazily through the relation getter; prefer explicit eager
loading where supported to avoid N+1.

## Step 4: Optimistic Locking

For concurrent edits enable the optimistic-locking trait from the package docs
(`docs/optimistic-locking.md`): add an integer `version`-style column; `save()` throws on stale writes.

## Boundaries (important)

Keep business logic OUT of AR classes. If you used Yii2 AR classes containing validation,
scenarios and workflows:

| Responsibility   | Where it goes in Yii3                                                |
|------------------|----------------------------------------------------------------------|
| Table mapping    | AR class                                                             |
| Input validation | FormModel (`yii3-actions`)                                  |
| Business rules   | UseCase/service class                                                |
| Complex queries  | still fine as methods on a small repository wrapping `Post::query()` |

Form data flows into AR via explicit assignment (or hydration), never by mass-binding raw request input.

## Migrations

Schema changes stay in migrations (references/MIGRATIONS.md); never alter schema from AR code at runtime.

## Verification Checklist

1. Connection resolvable — instantiating the model doesn't throw.
2. Save → find → update → delete round-trips against the dev DB.
3. `php -l`; unit tests mock the AR or use an in-memory SQLite connection.
