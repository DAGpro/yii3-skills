Add "Sign in with GitHub" to the app:

- Configure the GitHub OAuth client in our params (the credentials come from the `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` environment variables).
- Add the auth entry and callback routes using the auth-client package.
- After a successful callback, log the user in through our existing session flow and send them to the dashboard.

The GET /login form route and the dashboard are already wired.
