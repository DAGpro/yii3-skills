Our JSON handling in the reporting endpoints is fragile and I want it fixed the way our conventions prescribe:

- The JSON export endpoint builds its response body by hand with `json_encode()`. When a payload contains malformed UTF-8 or an infinitely nested structure, the whole request dies with an uncaught error. Elsewhere we decode with a bare `json_decode()`, which silently returns null on syntax errors and hides the problem.
- The HTML report action embeds user-provided preferences into a `<script>` tag using `json_encode()`. If a preference value contains `</script>`, the tag is broken out of - a classic XSS hole.

Please replace the raw `json_encode`/`json_decode` calls with the framework's exception-safe JSON helper, and make sure the JSON embedded into the script tag cannot break out of the tag by HTML-encoding it the prescribed way (do not hand-roll the escaping with string replacements).
