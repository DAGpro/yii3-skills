Customers who place a duplicate order currently get the raw error page: "DB constraint fk_order_customer failed for user_id=...". That leaks storage internals and tells the customer nothing.

Make the duplicate-order failure a friendly exception using the framework's friendly-exception mechanism:
- A human-readable title instead of the raw exception class name.
- No internal details (constraint names, user ids, storage messages) in the customer-visible message.
- A suggested solution telling the customer what to do next.

The checkout flow goes through CheckoutService::placeOrder(); the global error handler is already wired.
