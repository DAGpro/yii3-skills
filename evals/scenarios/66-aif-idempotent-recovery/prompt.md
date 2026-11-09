An ongoing implementation of the order cancellation feature (`POST /api/orders/{id}/cancel`) was interrupted.
The database migration `M20261109120000_CreateOrderTable.php`, the domain interface `OrderRepositoryInterface.php`, the repository `OrderRepository.php`, and the DI binding in `config/common/di/order.php` are already implemented.

Please resume and complete the feature:
1. Create the input DTO `src/Order/CancelOrderDto.php` with validated properties (cancellation reason, operator ID).
2. Create the single-responsibility HTTP action `src/Order/CancelOrderAction.php` returning `Psr\Http\Message\ResponseInterface`.
3. Register the route `POST /api/orders/{id}/cancel` in `config/routes.php`.
4. Emit the AI Factory verification gate block (`aif-gate-result`).

CRITICAL INVARIANT (IDEMPOTENCY & RECOVERY):
Do NOT re-create the migration or generate duplicate migrations for the order table.
Do NOT re-bind `OrderRepositoryInterface` in any configuration file (it is already bound).
Do NOT register duplicate routes.
