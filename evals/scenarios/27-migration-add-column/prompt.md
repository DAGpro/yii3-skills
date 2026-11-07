We need to track when users last signed in. Write a migration that adds a nullable `last_login_at` TIMESTAMP column to the `users` table.

Requirements:
- The migration must be reversible: a rollback has to drop the column again.
- Do not modify the existing migrations - history is already deployed, we only append new ones.
