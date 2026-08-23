# Yii3 View Patterns — Templates, Forms & Widgets

Presentation-side code patterns used by actions generated via `/yii3-actions`.
Rendering flow and layout/injection setup are in SKILL.md.

## HTML Helper (yiisoft/html)

```php
<?php declare(strict_types=1); ?>

use Yiisoft\Html\Html;

?>

<!-- Form with Html helper -->
<?php
$htmlForm = Html::form()
    ->post($urlGenerator->generate('users.create'))
    ->csrf($csrf);
?>
<?= $htmlForm->open() ?>

    <div class="mb-3">
        <?= Html::label('Name', 'name', ['class' => 'form-label']) ?>
        <?= Html::textInput('name', $form->getName(), [
            'class' => 'form-control',
            'required' => true,
        ]) ?>
    </div>

    <div class="mb-3">
        <?= Html::label('Email', 'email', ['class' => 'form-label']) ?>
        <?= Html::input('email', 'email', $form->getEmail(), [
            'class' => 'form-control',
            'required' => true,
        ]) ?>
    </div>

    <?= Html::submitButton('Save', ['class' => 'btn btn-primary']) ?>
<?= $htmlForm->close() ?>

<!-- Error display -->
<?php if (!empty($errors)): ?>
    <div class="alert alert-danger">
        <?= Html::ul($errors, ['class' => 'mb-0']) ?>
    </div>
<?php endif; ?>
```

## Widget Pattern (yiisoft/widget)

```php
<?php

declare(strict_types=1);

namespace {Namespace}\Widget;

use Yiisoft\Html\Html;
use Yiisoft\Widget\Widget;

final class BreadcrumbWidget extends Widget
{
    /** @param array<array{label: string, url?: string}> $items */
    public function __construct(
        private array $items = [],
    ) {}

    public static function widget(array $config = []): static
    {
        return parent::widget($config);
    }

    public function run(): string
    {
        $html = '<nav aria-label="breadcrumb"><ol class="breadcrumb">';

        foreach ($this->items as $i => $item) {
            $isActive = $i === count($this->items) - 1;
            $class = $isActive ? 'breadcrumb-item active' : 'breadcrumb-item';

            if ($isActive) {
                $html .= Html::tag('li', $item['label'], ['class' => $class, 'aria-current' => 'page']);
            } else {
                $html .= Html::tag('li',
                    Html::tag('a', $item['label'], ['href' => $item['url'] ?? '#']),
                    ['class' => $class]
                );
            }
        }

        $html .= '</ol></nav>';
        return $html;
    }
}

// Usage in template:
echo BreadcrumbWidget::widget()->items([
    ['label' => 'Home', 'url' => '/'],
    ['label' => 'Users', 'url' => '/users'],
    ['label' => 'Edit'],
]);
```

## View Renderer with Layout

```php
<?php

declare(strict_types=1);

namespace {Namespace}\User\Action;

use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Yiisoft\Yii\View\Renderer\WebViewRenderer;

final readonly class DashboardAction
{
    public function __construct(
        private WebViewRenderer $viewRenderer,
    ) {}

    public function __invoke(ServerRequestInterface $request): ResponseInterface
    {
        // Render with layout
        return $this->viewRenderer
            ->withLayout('@views/layouts/admin.php')
            ->render('dashboard', [
                'title' => 'Dashboard',
                'stats' => $this->getStats(),
            ]);
    }
}
```
