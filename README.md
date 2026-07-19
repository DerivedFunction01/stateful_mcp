# Stateful MCP Middleware Suite

A modular, version-controlled Model Context Protocol (MCP) middleware suite designed to help LLMs manage stateful workflows efficiently. 

This suite provides stateful abstractions for filters, objects, dictionary concepts, and event streams, allowing LLMs to build complex states incrementally across multiple conversational turns—optimizing token consumption and avoiding huge payloads.

---

## Service Architecture

```
                       ┌─────────────────────────┐
                       │   Dictionary Service    │
                       │ (Concept Normalisation) │
                       └────────────┬────────────┘
                                    │
       ┌────────────────────────────┼────────────────────────────┐
       ▼                            ▼                            ▼
┌──────────────┐             ┌──────────────┐             ┌──────────────┐
│Filter Service│             │Object Service│             │Event Service │
│ (VCS Queries)│             │ (VCS States) │             │ (VCS Logs)   │
└──────────────┘             └──────────────┘             └──────────────┘
```

1. **[Filter Service](./config/about/filter.md)**: Build multi-clause database queries incrementally.
2. **[Object Service](./config/about/object.md)**: Manage structured JSON objects (orders, SOAP notes) with stateful delta tracking and templating.
3. **[Dictionary Service](./config/about/dictionary.md)**: Normalize clinical and business abbreviations to standardized concept identifiers before query injection.
4. **[Event Service](./config/about/event.md)**: Model version-controlled append-only logs with branching, symmetric LCA merging, and stateful conflict resolution.
5. **[Log Service](./src/services/log.ts)**: A stateless traversal log service using HMAC-SHA256 tokens for session-free pagination over commit parent chains.

---

## Setup & Running the Servers

### Prerequisites
* [Bun](https://bun.sh) runtime (version 1.0.0 or later).

### Installation
Clone the repository and install the dependencies:
```bash
bun install
```

### Configuration
The middleware configuration is defined in the `config/` directory:
* **`config/tools.config.json`**: Configures tool schemas, validation engines, and query targets.
* **`config/storage.config.json`**: Configures memory, SQLite, or PostgreSQL backends for session and persistent storage, as well as threshold parameters for auto-compression.

---

## Running the MCP Servers

You can launch each service independently or route to them via the monolith router using the `SERVICE_TYPE` environment variable:

```bash
# Start the Filter Service MCP Server
SERVICE_TYPE=filter bun index.ts

# Start the Object Service MCP Server
SERVICE_TYPE=object bun index.ts

# Start the Dictionary Service MCP Server
SERVICE_TYPE=dictionary bun index.ts

# Start the Event Service MCP Server
SERVICE_TYPE=event bun index.ts
```

---

## Developer Guidance Tools (`*_about` and `*_examples`)

LLMs trained on stateless tool calling tend to call tools in one-shot. To prevent this, each stateful service exposes two runtime tools:
* **`*_about`**: Returns Markdown documentation explaining the *how*, *when*, and *why* of the stateful pattern.
* **`*_examples`**: Returns worked multi-turn conversational transcripts showing ideal interaction models (incremental updates, branching, resolving conflicts).

LLMs should be instructed to check these tools during initialization or when handling complex states.
