# Trace Form Engine (`TraceStore`)

The **Trace Form Engine (`TraceStore`)** introduces **procedural execution learning** to the stateful middleware suite. While standard memory stores static facts, `TraceStore` records and executes procedural macro workflows.

## Key Concepts
- **Machine-Driven Form**: Steps execute automated tool calls and evaluate returned state via the AST translation pipeline (`get` operation).
- **Zero-Roundtrip Macros**: Multi-step operations execute end-to-end in a single LLM roundtrip.
- **Safety & Validation**: Input slots are validated pre-execution; non-autonomous tools (`autonomous: false`) pause for human approval (`trace_resume`); transactional tools execute compensation rollbacks on failure.
- **Delta Refinements**: `trace_refine` allows targeted step modifications (`replace_step`, `append_step`, `remove_step`, `swap_with_persistent`).

Use `trace_query` to search matching trace workflows before attempting multi-turn manual tool construction.
