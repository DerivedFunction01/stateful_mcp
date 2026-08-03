# @stateful-mcp/cli

Administrative command line interface tool for the Stateful Data Management Framework. It provides utilities for garbage collection, inspection, and state migration.

## Installation

```bash
npm install -g @stateful-mcp/cli
# or
bun add --global @stateful-mcp/cli
```

## Usage

```bash
# Clean up stale session trees / run GC
stateful-mcp-admin gc --session-id <id>

# Inspect state of a particular commit/object
stateful-mcp-admin inspect --id <id>
```

For full options and command reference, see the main monorepo documentation.
