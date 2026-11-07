Our contact page is English-only, but we need it in Russian too. Make it translatable:

- Replace the hardcoded user-facing strings in `ContactAction` (page title, success flash, error flash) and in the contact view template (intro note, email label, submit button label) with translator calls through yiisoft/translator, category 'app'. Keep the English source strings as message IDs.
- The translated language must come from the application's locale handling - do not pass a hardcoded target locale in the translate calls and do not branch on the locale manually.
- Add the Russian translations for the `ru` locale as a PHP-message dictionary (the yiisoft/translator-message-php storage format), in a `messages` directory at the project root.

The translator and the PHP message storage packages are already required in composer.json.
