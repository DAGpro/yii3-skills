Add a GET /posts/{id}/related endpoint that returns the related posts for the given post as JSON.

Data fetching belongs in the application layer, not the web layer: this project already has an application-layer use case for finding related posts - the endpoint should delegate to it rather than querying anything itself.
