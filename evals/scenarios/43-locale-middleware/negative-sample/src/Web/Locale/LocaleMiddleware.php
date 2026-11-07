<?php

declare(strict_types=1);

namespace App\Web\Locale;

use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Server\MiddlewareInterface;
use Psr\Http\Server\RequestHandlerInterface;
use Yiisoft\Translator\TranslatorInterface;

/**
 * Resolves the locale from the {_language} URL prefix and applies it globally
 * by mutating the shared translator instance.
 */
final readonly class LocaleMiddleware implements MiddlewareInterface
{
    private const LANGUAGE_PATTERN = '/^[a-z]{2}$/i';

    public function __construct(private TranslatorInterface $translator) {}

    public function process(ServerRequestInterface $request, RequestHandlerInterface $handler): ResponseInterface
    {
        $first = explode('/', trim($request->getUri()->getPath(), '/'))[0] ?? '';
        if (preg_match(self::LANGUAGE_PATTERN, $first) === 1) {
            $this->translator->setLocale(strtolower($first));
        }

        return $handler->handle($request);
    }
}
