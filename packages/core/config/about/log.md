# Log Service: Strategy & Guidelines

The Log Service is a read-only time machine over Filter and Object history. It is designed for inspection, audit, and explanation — never for mutation.

## Intentional Strategy
* **Use it to explain lineage**: When a user asks "how did this filter/object get to this state?", open a log traversal and walk back, summarizing each checkpoint's delta.
* **Page, don't dump**: Always pass a modest `limit` to `log_open` and follow `next_page_token` with `log_next`. Large histories should be consumed incrementally to protect the context window.
* **Pair with the owning service**: A `delta`/`rules` entry from the Log Service tells you *what changed* at a checkpoint. To see the *full* state at that point, call `filter_get_filter` / `object_get` on the returned `id`.
* **Remember it is ephemeral**: The Log Service only sees checkpoints still present in the session store. After `filter_gc` / `object_gc`, older history is gone — traverse before pruning.
