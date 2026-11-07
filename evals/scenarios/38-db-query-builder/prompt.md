Our order search endpoint has a security problem: the search term is pasted straight into the SQL string in SearchOrdersRepository, so a customer typing a quote can break out of the LIKE literal.

Rework the repository query to use the query builder with bound parameters, so the term can never end up inside the SQL text itself. Keep the repository's public contract (the search method and what it returns) unchanged - the action should not need any changes.
