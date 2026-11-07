Our multilingual site serves pages under a language prefix (`/{_language}/...`), but users always get the default language: the locale is never resolved from the request.

Implement per-request locale resolution the way our guides prescribe:

- Fill in the empty `LocaleMiddleware`: resolve the locale from the request and expose it through the locale provider for this request.
- Register the middleware so it runs for every request, ahead of route matching.
- Make the about page use the resolved locale instead of the hardcoded one.
- Keep the translator out of it: no global locale mutation (do not call `TranslatorInterface::setLocale()`) - pass the resolved locale per request instead.

The translator is already wired in `config/common/di/translation.php`; the locale provider is not wired yet.
