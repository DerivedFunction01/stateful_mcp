# @stateful-mcp/mcp-transport

The Model Context Protocol (MCP) server delivery layer for the Stateful Data Management Suite. It wraps the core framework middlewares and exposes them as pluggable MCP servers over stdio transport.

## Installation

```bash
npm install -g @stateful-mcp/mcp-transport
# or
bun add --global @stateful-mcp/mcp-transport
```

## Running the Server

Start an MCP service via the monolith router by specifying the `SERVICE_TYPE` environment variable or command-line argument:

```bash
# Launch filter service (reads config from ./config by default)
SERVICE_TYPE=filter stateful-mcp-transport

# Or with CLI argument:
stateful-mcp-transport object
```

### Supported Services:

- `filter`
- `object`
- `dictionary`
- `log`
- `event`
- `form`

## Claude Desktop / Cursor Integration

Add this to your Claude Desktop config (e.g. `~/.support/Claude/claude_desktop_config.json`) or Cursor settings:

```json
{
  "mcpServers": {
    "stateful-mcp": {
      "command": "bun",
      "args": ["run", "/path/to/dist/index.js", "filter"],
      "env": {
        "STATEFUL_MCP_CONFIG_DIR": "/path/to/your/config"
      }
    }
  }
}
```

For configuration details and guides, see the main monorepo docs.
