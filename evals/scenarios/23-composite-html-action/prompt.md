Add a post EDITING page to the blog:

- GET /posts/{id}/edit renders an HTML form (title, content, cover image upload) pre-populated from the stored post.
- POST /posts/{id}/edit validates the submitted form through the form-model/FormHydrator stack, saves the uploaded cover image into a runtime directory (use the file helper from yiisoft/files), updates the post through the existing use case (UpdatePostService), and redirects back with a success flash message.
- When the post does not exist, respond with the idiomatic 404.
- Templates must escape output.
- The new routes must sit behind session + CSRF middleware (SessionMiddleware and CsrfTokenMiddleware) wired in the correct order in the global middleware stack.
