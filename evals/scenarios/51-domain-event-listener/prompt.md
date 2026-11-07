OrderService does too much: it sends the confirmation email itself, right inside the domain operation.

Decouple it with a domain event: the service should dispatch an `OrderCompleted` event carrying the order and customer identifiers, and a dedicated listener should react to it by sending the email. Register the listener in the events config per our conventions.
