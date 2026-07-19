# Log Service Reference Guide

The Log Service is a read-only history walker over the versioned state created by the Filter and Object services. Where those services *build* checkpointed state, the Log Service *traverses* it — letting you page backward through a filter or object's ancestry (the parent-pointer DAG) to inspect how it evolved, one checkpoint at a time.

It is intentionally separate from the Event Service: the Event Service manages an append-only array of structured records, whereas the Log Service replays the lineage of a single filter or object and surfaces the forward/backward deltas between checkpoints.

---

## 1. Stateful Traversal (not stateful mutation)

Unlike the other services, the Log Service holds **no state of its own**. It reads the session stores of the Filter and Object services (`filter_session_state` / `object_session_state`) that are already configured in `storage.config.json`. This means it can only walk history that still exists in the session — running `filter_gc` / `object_gc` will prune the very checkpoints the Log Service would otherwise traverse.

---

## 2. Tools

### `log_open`
Begins a traversal from a starting filter or object ID/alias and returns the first page of history.

* **`type`**: `"filter"` or `"object"` — which store to walk.
* **`session_id`**: The session whose checkpoints you want to inspect.
* **`id_or_alias`**: The starting checkpoint (typically the current tip, or a named alias).
* **`limit`**: Page size (default `5`).

The response contains:
* **`entries`**: Ordered from the starting checkpoint back toward the root.
  * For **filters**: each entry carries `{ id, parent_id, created_at, rules }` — `rules` is the *delta* (`add`/`remove`) recorded at that checkpoint.
  * For **objects**: each entry carries `{ id, parent_id, created_at, delta }` — `delta` is the sparse set of keys that changed relative to the checkpoint's parent (computed by diffing the parent's data).
* **`next_page_token`**: A signed, stateless token to fetch the next page, or `null` when the root is reached.
* **`has_more`**: Convenience boolean mirroring whether `next_page_token` is present.

### `log_next`
Fetches the next page using a previously returned `next_page_token`. It takes a single argument, **`page_token`**, and returns the same `{ entries, next_page_token, has_more }` shape as `log_open`. Replaying tokens walks further back up the parent chain until `next_page_token` is `null`.

---

## 3. The Page Token (stateless pagination)

Pagination is driven by a cryptographically signed token rather than server-side cursor state:

* The token wraps the current position (`type`, `sessionId`, `currentNodeId`, `pageSize`, optional `userId`).
* It is signed with HMAC-SHA256 using `LOG_SERVICE_SECRET` (set this env var for stable tokens across restarts; otherwise a random secret is generated on startup).
* On `log_next`, the signature is verified before the token is trusted. A tampered or forged token is rejected.

Because the token is self-contained, the Log Service remains stateless — no traversal session lives on the server between calls.

---

## 4. Practical Notes

* **Direction**: History flows from the newest checkpoint (the one you pass to `log_open`) toward the oldest (the root with `parent_id: null`).
* **Filter deltas**: `rules` is the per-checkpoint change set, not the full accumulated filter. To see the fully projected filter at any checkpoint, use `filter_get_filter` on that `id`.
* **Object deltas**: `delta` shows only the keys that differ from the parent; the full object at any checkpoint can be retrieved with `object_get` / `object_inspect`.
* **No write path**: `log_open` / `log_next` are strictly read-only by design — they never create, mutate, or compress checkpoints.
