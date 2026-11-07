Sign-up must reject the reserved usernames 'admin', 'root', and 'support'.

Implement this as a reusable custom validation rule - its own rule class plus rule handler - wired into the signup form model's validation rules, so it runs as part of the existing form hydration/validation. Do not put the reserved-word check as inline logic in the action.
