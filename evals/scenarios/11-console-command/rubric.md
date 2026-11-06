Judge (pass/fail + evidence from the diff/transcript):
1. The command is a thin Symfony Console command (configure + execute returning ExitCode), delegating to the RecountViews handler; no SQL or persistence in the command class.
2. The command name uses the colon convention (blog:recount) and matches between #[AsCommand] and the registration.
3. Registration is wired so the app template actually loads it: config/console/params.php exposes the commands key (inline or via config/console/commands.php require), not a dangling file nobody requires.
4. DI: the RecountViews handler is injected via the constructor, not resolved manually.
