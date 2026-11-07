<?php

declare(strict_types=1);

namespace App\Web\Site;

use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Yiisoft\Translator\TranslatorInterface;
use Yiisoft\Yii\View\Renderer\WebViewRenderer;

final readonly class AboutAction
{
    public function __construct(
        private WebViewRenderer $view,
        private TranslatorInterface $translator,
    ) {}

    public function __invoke(ServerRequestInterface $request): ResponseInterface
    {
        // Locale resolution is not wired yet: every page is served in the default
        // locale, regardless of the {_language} URL prefix.
        $pageLocale = 'en-US';

        return $this->view->render('site/about', [
            'pageTitle' => $this->translator->translate('About us'),
            'introText' => $this->translator->translate('Learn who we are and what we do.'),
            'pageLocale' => $pageLocale,
        ]);
    }
}
