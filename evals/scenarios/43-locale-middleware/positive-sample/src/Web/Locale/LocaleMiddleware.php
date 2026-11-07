<?php

declare(strict_types=1);

namespace App\Web\Locale;

use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Server\MiddlewareInterface;
use Psr\Http\Server\RequestHandlerInterface;
use Yiisoft\I18n\Locale;
use Yiisoft\I18n\LocaleProvider;

/**
 * Resolves the locale from the {_language} URL prefix and exposes it through
 * LocaleProvider for the current request. The shared translator instance is
 * intentionally left untouched: per-request locale must not be written into
 * stateful services (no TranslatorInterface::setLocale()).
 */
final class LocaleMiddleware implements MiddlewareInterface
{
    private const LANGUAGE_PATTERN = '/^[a-z]{2}$/i';

    public function __construct(private LocaleProvider $locales) {}

    public function process(ServerRequestInterface $request, RequestHandlerInterface $handler): ResponseInterface
    {
        $language = $this->languageFromPath($request);
        if ($language !== null) {
            $this->locales->set(new Locale($language));
        }

        return $handler->handle($request);
    }

    /**
     * URL path prefix is the guide's first resolution stage: /ru/about -> 'ru'.
     * Without a prefix the provider keeps its default locale.
     */
    private function languageFromPath(ServerRequestInterface $request): ?string
    {
        $first = explode('/', trim($request->getUri()->getPath(), '/'))[0] ?? '';

        return preg_match(self::LANGUAGE_PATTERN, $first) === 1 ? strtolower($first) : null;
    }
}
