# Stateful MCP Middleware Suite

A modular, version-controlled [Model Context Protocol (MCP)](https://modelcontextprotocol.io) middleware suite that helps LLMs manage stateful workflows incrementally across conversational turns — filters, objects, event logs, and a terminology dictionary — optimizing token consumption and avoiding huge payloads.

Each service is exposed as an MCP server over stdio and launched via the monolith router.

---

## Install

```bash
npm install -g stateful-mcp      # or: npm install stateful-mcp
```

> **Runtime:** Bun (>= 1.0) is required to run the server, because the SQLite storage adapter uses `bun:sqlite`. The Memory and PostgreSQL adapters work under any supported runtime; only the SQLite adapter needs Bun.

---

## Quick start

```bash
# Launch a service (reads config from ./config by default)
SERVICE_TYPE=filter stateful-mcp

# Or point at an explicit config directory
stateful-mcp --config-dir /path/to/my-config
SERVICE_TYPE=object stateful-mcp -c /path/to/my-config
```

The binary maps to the monolith router in `index.ts`. `SERVICE_TYPE` selects the service: `filter`, `object`, `dictionary`, `log`, or `event` (defaults to `filter`).

---

## Configuration

Configuration lives in the **config directory** and is split by concern:

| File | Purpose |
|------|---------|
| `config/tools.config.json` | Tool schemas, validation engines, and query backends. |
| `config/storage.config.json` | Storage backends (memory / SQLite / PostgreSQL) for session & persistent state, auto-compression thresholds, and `pagination_limits`. |
| `config/about.config.json` | Markdown docs served by the `*_about` / `*_examples` developer-guidance tools (optional). |

### Where config is read from

`loadMiddlewareConfig` resolves the config directory in this order:

1. `--config-dir <path>` / `-c <path>` / `--config-dir=<path>` (CLI flag)
2. `STATEFUL_MCP_CONFIG_DIR` (environment variable)
3. `process.cwd()` (fallback)

Ship your own `config/` and point the package at it — you do **not** rely on the publisher's demo config. A single-file `filter.config.json` (or `config.json`) at the config root is also supported.

### Environment variables

| Variable | Required | Purpose |
|----------|----------|---------|
| `SERVICE_TYPE` | no | Which service to start (`filter` default). |
| `STATEFUL_MCP_CONFIG_DIR` | no | Directory containing `config/`. |
| `LOG_SERVICE_SECRET` | no | 32-byte HMAC key for stateless `log_next` page tokens. Random if unset. |
| `WORKSPACE_ID` | no | Fallback dictionary workspace id (default `global`). |

---

## Optional: Native DataFrame query engine

The `dataframe` query engine runs DuckDB SQL natively over CSV, Parquet, or JSONL files.

---

## Building from source

```bash
bun install
npm run build         # bundles dist/index.js (bun build) + emits .d.ts + copies assets
```

`prepublishOnly` runs `npm run build`, so `npm publish` always ships a built package.

---

## Services

1. **Filter Service** — build multi-clause database queries incrementally (VCS-style rule DAG).
2. **Object Service** — manage structured JSON objects with stateful delta tracking and templating.
3. **Dictionary Service** — normalize abbreviations to standardized concept identifiers.
4. **Event Service** — version-controlled append-only logs with branching, LCA merging, and conflict resolution.
5. **Log Service** — stateless, paginated traversal over filter/object history using HMAC-signed page tokens.
6. **Form Service** — manage stateful interactive forms with branching logic, step validations, and back-navigation staleness tracking.

Each service exposes `*_about` / `*_examples` developer-guidance tools. LLMs should consult them when handling complex state.

See `docs/` for the full reference (filter, object, form, event, dictionary, log, config, pipeline, browser).

---

## Client-Side & Browser Storage

For web/frontend environments, the suite provides native client-side storage repositories:
*   **LocalStorage**: Simple web storage for session/persistent state.
*   **IndexedDB**: Non-blocking asynchronous store for larger state histories.

See [docs/browser.md](docs/browser.md) for details on integrating client-side adapters.

---

## Compliance Test Suite

Verify that custom third-party storage adapters strictly comply with the stateful consistency and isolation contract:
*   Exposes `runStoreComplianceTests`, `runFormStoreComplianceTests`, `runObjectStoreComplianceTests`, and `runEventStoreComplianceTests` via `"stateful-mcp/adapters/compliance"`.
*   Asserts uniqueness, routing, isolation, TTL, and VCS compaction correctness.
