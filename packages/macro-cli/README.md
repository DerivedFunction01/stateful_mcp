# `@stateful-mcp/macro-cli`

The generic terminal presentation for `@stateful-mcp/macro`.

The package uses OpenTUI’s native terminal renderer with its React binding. The
headless workspace remains responsible for layout, focus, commands, journals,
extension contributions, and editor behavior; this package adapts those
contracts to character-cell rendering and OpenTUI key events.

```sh
bun run packages/macro-cli/src/index.ts
bun run packages/macro-cli/src/index.ts --workspace=.macro/workspace.json
```

The browser visual reference lives separately in `packages/macro-ui-prototype`
and is not imported by this package.
