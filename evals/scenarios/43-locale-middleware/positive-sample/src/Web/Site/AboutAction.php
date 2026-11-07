<?php

declare(strict_types=1);

namespace App\Web\Site;

use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Yiisoft\I18n\LocaleProvider;
use Yiisoft\Translator\TranslatorInterface;
use Yiisoft\Yii\View\Renderer\WebViewRenderer;

final readonly class AboutAction
{
    public function __construct(
        private WebViewRenderer $view,
        private TranslatorInterface $translator,
        private LocaleProvider $locales,
    ) {}

    public function __invoke(ServerRequestInterface $request): ResponseInterface
    {
        // Resolved per request by LocaleMiddleware and exposed through LocaleProvider.
        $pageLocale = $this->locales->get()->asString();

        return $this->view->render('site/about', [
            'pageTitle' => $this->translator->translate('About us', locale: $pageLocale),
            'introText' => $this->translator->translate('Learn who we are and what we do.', locale: $pageLocale),
            'pageLocale' => $pageLocale,
        ]);
    }
}
