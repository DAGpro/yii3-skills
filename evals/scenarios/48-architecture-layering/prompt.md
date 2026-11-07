Our domain layer is leaking. `src/Domain/Billing/InvoiceService.php` builds the payment gateway itself (`new StripeGateway`) and even reaches into HTTP concerns.

Fix the layering: the domain should depend on an abstraction it owns, the infrastructure adapter should implement that abstraction, and composition (deciding which implementation runs) should happen in the container, not inside domain code.
