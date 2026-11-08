# Project Architecture

Architecture pattern: Vertical Slice (Feature-based).
Features live under `src/<Feature>/`:
- `src/<Feature>/Domain/` (Entities, Value Objects, Repository Interfaces, Domain Events)
- `src/<Feature>/Application/` (Use Case Commands, Handlers, Event Listeners)
- `src/<Feature>/Infrastructure/` (SQL / DB Repositories)
- `src/<Feature>/Presentation/` (Single-Action Controllers, Input DTOs)

Configuration:
- DI bindings: `config/common/di/<feature>.php`
- Routes: `config/common/routes.php`
- Events: `config/common/events.php`

