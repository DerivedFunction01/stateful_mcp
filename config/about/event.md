# Event Service: Strategy & Guidelines

The Event Service models structured append-only event logs (e.g. observation flows, order histories) via version-controlled commit DAG chains.

## Multi-turn Conflict Management
* **Merge Conflicts**: When merging parallel updates on identical event IDs, a merge conflict is raised.
* **Inspect & Resolve**: Call `event_merge_inspect` to view conflicting values, and resolve them step-by-step using `event_merge_resolve` strategies.
* **Commit**: Call `event_merge_commit` only when all conflicts are resolved.
