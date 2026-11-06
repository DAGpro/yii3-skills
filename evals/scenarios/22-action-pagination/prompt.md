Add a listing endpoint to the blog API: GET /posts returns the published posts as a JSON list.

- Support page and pageSize query parameters; pageSize defaults to 20 and is capped at 100.
- Every listing must be bounded before it reaches the response: paginate the data reader with OffsetPaginator from yiisoft/data (page size set explicitly), or apply an explicit limit to the query. Never return the unbounded result set.
- PostRepositoryInterface (bound in config/common/di/blog.php) already provides the published-posts data reader.
