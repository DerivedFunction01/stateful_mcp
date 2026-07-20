# Filter Service: Strategy & Guidelines

The Filter Service builds database queries incrementally. It is designed to save context window tokens and allow interactive redirection by the user.

## Intentional Strategy
* **Incremental Construction**: Do NOT call `filter_add` with all conditions at once. Emit one or two conditions, inspect, and continue. This allows the user to correct you before you waste compute/tokens.
* **Inspect before Execution**: Always call `filter_inspect` before executing a query to ensure you are executing the correct filter state.
* **Compression**: Call `filter_compress` (or let auto-compression trigger) to flatten long linear version chains and keep execution performance high.
* **Branching**: Use the version chain to branch when a user changes their mind rather than rebuilding the filter from scratch.
