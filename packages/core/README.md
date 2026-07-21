# @stateful-mcp/core

The canonical framework core for the Stateful Data Management Suite. It provides runtime-agnostic, LLM-independent middleware stores and storage adapters for managing version-controlled, tree-structured application states.

## Middlewares included

1. **FilterStore**: Build, compose, and compress complex multi-clause database queries incrementally using a version-controlled rule DAG.
2. **ObjectStore**: Manage structured JSON objects with stateful delta tracking, schema validation, and reference resolution.
3. **FormStore**: Track interactive form states with branching question paths, skip logic, and back-navigation staleness.
4. **EventStore**: Append-only log DAG with branching, LCA merging, and conflict resolution.
5. **DictionaryStore**: Semantic translation and terminology mapping normalizing abbreviations to canonical concepts.

## Installation

```bash
npm install @stateful-mcp/core
# or
bun add @stateful-mcp/core
```

## Features

- **Storage Adapters**: Memory, JSONL, SQLite, PostgreSQL, and Browser (LocalStorage / IndexedDB).
- **VCS Compaction**: Linear history auto-compression to keep DAG depths bounded.
- **Event Broker**: Integrated `eventBroker` to subscribe to mutations across all stores (`state:changed` events) for auditing and observability.

For the full reference documentation, please visit the main monorepo documentation.
