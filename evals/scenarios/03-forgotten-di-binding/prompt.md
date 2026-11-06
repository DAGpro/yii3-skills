Track post views: each time a post is shown, increment a per-post counter.
Add a ViewCounterInterface and its DB-backed implementation (table post_view, migration needed) and use it from ShowPostAction.
