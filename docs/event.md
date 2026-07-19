# Event Service Reference Guide

The Event Service provides git-like version control over append-only arrays of structured records (such as clinical flowsheet logs or point-of-sale transaction logs).

---

## 1. Commit DAG Structures

Instead of a flat array, the log is represented as a directed acyclic graph (DAG) of commits:
* **`event_init`**: Registers a schema and starts an initial log commit.
* **`event_append`**: Adds a new typed record to the end of the projected array.
* **`event_patch`**: Updates a specific record key-value structure using a sparse delta. It records `before_data` and tracks `mutation_parent_ids` indicating the last version where that record was mutated.
* **`event_delete`**: Marks a record as deleted in the projected output.

---

## 2. N-Way Merging & Conflict Detection

Multiple parallel streams can be merged into a target commit in a single operation:
`event_merge(session_id, source_ids_or_aliases, target_id)`

### LCA Resolution
The merge engine finds the Lowest Common Ancestor (LCA) of all merging commits to establish the baseline state.

### Conflict Rules
A conflict is detected if the **same record ID** was updated or deleted by **more than one** of the merging branches since their LCA.

---

## 3. Stateful Merge Sessions

If conflicts are detected, the merge enters a stateful session:
1. **`event_merge_inspect`**: Returns the list of conflicting values on each branch since LCA.
2. **`event_merge_resolve`**: Resolves a specific conflict. Strategies include `accept_source`, `accept_target`, or a custom merged `patch`. Resolving a conflict spawns a resolution checkpoint.
3. **`event_merge_commit`**: Writes the final merge commit once all conflicts have been resolved.
