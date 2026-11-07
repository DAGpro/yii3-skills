Implement the login flow for the app:

- POST /login accepts the form fields `login` + `password`, validates them (both required; the password at least 6 characters), verifies the credentials against the existing UserRepository, and logs the user in.
- Success: add a success flash message and redirect to /dashboard.
- Wrong credentials: add an error flash message and re-render the login form with a 422 status.
- Validation errors: re-render the form with a 422 status.

The GET /login route and the form template already exist; the dashboard route is wired too.
