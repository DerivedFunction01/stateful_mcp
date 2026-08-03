# Engine V2 — Phase 0: Aggregate identifiers & version sources

This report identifies the aggregate identifiers and version sources that V2
must track. It was produced by inspecting the existing system for Phase 0 step 3
("Identify current schema/document/workspace aggregate identifiers and version
sources") and is a living reference for the V2 durability layer (Phase 4).

## Current aggregate identifiers (legacy)

| Aggregate | Legacy identifier | Notes |
|---|---|---|
| Clinical document (SOAP note) | `noteId` (`note_<uuid12>`), resolved per-session via an `ObjectStore` alias (`sessionId` or explicit `alias`) | Commits are aliases in `EventStore`; the document is a projected `ObjectStore` object |
| Session | `sessionId` | Top-level owner scope for stores |
| Event commit | commit ID returned by `EventStore.create`/`appendBatch` | A commit is a node in the event chain, not a logical operation |
| Workspace | `workspaceId` (`work_<uuid12>`) | Stored as `EpistemicWorkspace`; has its own `EventStore` alias + commit chain |
| Branch | `branchId` (`branch_<workId>_<idx>`) | Field on `EpistemicWorkspace.branches[]` |
| Cell | `cellId` | Persisted via KV/SQL `CellStore`, keyed by `sessionId`; no version column today |

## Version sources today

- `EventStore` couples versioning to the commit **chain** (parent commit → child
  commit) and `linearDepth`; there is no explicit numeric aggregate version for
  the clinical document.
- `ObjectStore` maintains whole-object state with no optimistic-concurrency
  version exposed to callers.
- `CellStore.save()` is a blind upsert — no compare-and-set on a cell revision.
- Macro definitions carry an integer `version`, and authoring templates carry a
  `version`.
- The V1 preview computes `compatibilitySignature` (a target-paths fingerprint)
  but no aggregate-version snapshot.

## V2 aggregate version contract (target)

V2 introduces an explicit, optimistic-concurrency-friendly version model in
`ExpectedAggregateVersion` (see `v2/macros/macro-plan.ts`):

```text
aggregateKind: "document" | "workspace" | "branch" | "cell"
aggregateId:   stable aggregate id
expectedVersion: numeric version
expectedHead:     optional event-chain head commit
```

V2 must:

- store a persisted numeric version (or durable head/checkpoint) per aggregate
  so previews can capture it and execution can reject changes;
- expose atomic compare-and-set on cell revision and on event append;
- reject stale previews instead of silently merging.

## Compatibility policy (Phase 0 step 4)

- Legacy callers, the legacy `Cell`/`CellProcessor`, `WorkspaceStore(parser)`,
  and the notebook remain operational and untouched until a V2 integration path
  is proven.
- V2 does not mutate or consume legacy macros/cells/events directly except
  behind the isolated compatibility adapter.
- V2 establishes its own aggregate identifiers and version sources; it does not
  overload the legacy `CellStore.save()` blind-upsert or the `ObjectStore` alias.
- When V2 is proven, the legacy path is retired start-to-finish; no dual-write
  correctness is attempted before the V2 completion gate.

## Forbidden imports (Phase 0 step 2)

See `tests/v2-dependency-boundary.test.ts`. V2 modules must not import:

- `parser/cdsl-parser.ts`;
- `parser/schema-parsers.ts` / `ParsedItem`;
- legacy parser profiles, tags, or stop-word gating
  (`parser/profiles`, `store/parser/profiles`, `parser/tags`,
  `store/reference/stop-words`);
- parsed-cell / ordered-learning domains (`store/learning/parsed_cell`,
  `store/learning/ordered_learning`, and their SQL compilers);
- parser-input prose templates (`store/reference/prose-parser-templates`).
