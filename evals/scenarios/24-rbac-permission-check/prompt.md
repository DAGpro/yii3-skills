Right now any logged-in user can wipe accounts from the admin area: POST /admin/users/{id}/delete removes a user account without any authorization check.

Only users granted the `userAdmin` permission may delete users. Guard the delete action accordingly; anyone else must get a 403 response.

The RBAC layer itself (manager, PHP file storage, role assignments) is already configured in config/ - just enforce the check in the right place.
