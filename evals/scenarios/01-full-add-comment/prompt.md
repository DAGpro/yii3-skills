Add the ability to comment on posts: POST /posts/{id}/comments with a `body` field (1-1000 characters).
After a comment is saved, a CommentAdded event must be dispatched. Tests are needed.
