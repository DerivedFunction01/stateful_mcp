# Variable Service (`VariableStore` & `VariableService`)

The **Variable Service (`VariableStore`)** provides a **topic-agnostic, reactive in-process state execution environment** for the `@stateful-mcp` middleware suite. 

While static memory repositories store snapshots, `VariableService` manages transient variable bindings (`{x=10, y=20}`), hierarchical 2-tier namespace scoping (`sessionId:blockInstanceId`), reactive mutation event subscriptions, and in-process AST translation pipeline execution (`packages/core/src/translation/compiler.ts`).

---

## Key Features

* **Context Provenance & Security**: `sessionId` and `userId` are injected strictly from transport context metadata (`extra._metadata.session_id`, `extra._metadata.user_id`), ensuring LLMs cannot forge or cross session boundaries.
* **2-Tier Hierarchical Scoping**: Variable lookups resolve **Block Instance Scope** (`sessionId:blockInstanceId`) first, falling back to **Global Session Scope** (`sessionId`). This prevents variable collisions across concurrent templates or sub-workflows.
* **AST Translation Compiler Binding**: Integrates directly with `@stateful-mcp/core`'s AST translation pipeline compiler (`executePipeline`), evaluating arithmetic, string, and comparison steps over active variable scopes.
* **Reactive Event Subscriptions**: Emits `VariableMutationEvent`s (`set`, `update`, `remove`, `eval`) via a local pub/sub listener bus and `CoreEventBroker`.
* **Pluggable Repositories**: Supports `MemoryVariableStore` for transient in-process execution and extensible persistent adapters.

---

## TypeScript API Reference

### `VariableService` Interface

```typescript
export interface VariableConditionRule {
  op: OpName;           // e.g. "leq", "lt", "eq", "neq", "geq", "gt", "contains", "starts_with", "ends_with"
  targetValue: unknown; // e.g. 20
}

export interface VariableInputEntry {
  key: string;
  value?: unknown;
  condition?: VariableConditionRule;
  blockInstanceId?: string;
}

export interface ConditionEvaluationResult {
  key: string;
  testValue: unknown;
  passed: boolean;
  condition?: VariableConditionRule;
}

export interface VariableService {
  /** Set or update a single variable within session or block instance scope */
  setVariable(sessionId: string, key: string, value: unknown, blockInstanceId?: string): Promise<void>;
  
  /** Batch set multiple variables (accepts key-value Record or Array of VariableInputEntry objects) */
  setVariables(
    sessionId: string,
    variables: Record<string, unknown> | VariableInputEntry[],
    blockInstanceId?: string
  ): Promise<void>;
  
  /** Retrieve a single variable value, array of key values, or complete scope */
  getVariable<T = unknown>(
    sessionId: string,
    keyOrKeys?: string | string[],
    blockInstanceId?: string
  ): Promise<Record<string, T> | T | undefined>;
  
  /** Retrieve the complete merged key-value scope active for a session / block instance */
  getScope(sessionId: string, blockInstanceId?: string): Promise<Record<string, unknown>>;
  
  /** Delete a single variable or array of keys, or purge an entire block instance scope */
  deleteVariable(sessionId: string, keyOrKeys: string | string[], blockInstanceId?: string): Promise<void>;
  clearBlockScope(sessionId: string, blockInstanceId: string): Promise<void>;
  
  /** Evaluate a test value against a variable's condition rule (e.g. set x leq 20, then evaluate "x" with 25) */
  testVariableCondition(
    sessionId: string,
    key: string,
    testValue: unknown,
    opOverride?: OpName,
    blockInstanceId?: string
  ): Promise<ConditionEvaluationResult>;

  /** Execute an AST Translation Pipeline against the active variable scope */
  evaluatePipeline(sessionId: string, pipeline: PipelineStep[], blockInstanceId?: string): Promise<unknown>;
  
  /** Subscribe to reactive variable mutation events */
  subscribe(sessionId: string, listener: (event: VariableMutationEvent) => void): () => void;
}
```

---

## 2-Tier Namespace Resolution

```
                        ┌───────────────────────────────┐
                        │   Global Session Scope        │
                        │   (sessionId::key)            │
                        └───────────────┬───────────────┘
                                        │ (Fallback)
                                        ▼
                        ┌───────────────────────────────┐
                        │   Block Instance Scope        │
                        │   (sessionId:blockInstanceId:key)
                        └───────────────────────────────┘
```

1. **`setVariable(sessionId, "x", 10)`**: Stores `x = 10` in global session scope (`sessionId::x`).
2. **`setVariable(sessionId, "x", 99, "block_01")`**: Stores `x = 99` in block scope (`sessionId:block_01:x`).
3. **`getVariable(sessionId, "x", "block_01")`**: Resolves `99` (block instance overrides global).
4. **`getVariable(sessionId, "x")`**: Resolves `10` (global session scope value).

---

## AST Translation Pipeline Integration

`VariableService.evaluatePipeline()` passes the active variable scope directly to `executePipeline()`:

```typescript
const pipeline: PipelineStep[] = [
  { op: "mul", args: [{ $var: "base_val" }, { $var: "multiplier" }], return_var: "product" },
  { op: "div", args: [{ $var: "product" }, { $var: "divisor" }], return_var: "raw_result" },
  { op: "round", args: [{ $var: "raw_result" }, 2], return_var: "final_val" }
];

const result = await variableService.evaluatePipeline(sessionId, pipeline, "block_01");
```

---

## Reactive Event Subscriptions

Subscribe to variable mutations for reactive step updates:

```typescript
const unsubscribe = variableService.subscribe(sessionId, (event) => {
  console.log(`Variable ${event.operation}: ${event.key} = ${event.value}`);
});

// Mutate variable
await variableService.setVariable(sessionId, "threshold", 0.95);

// Unsubscribe when finished
unsubscribe();
```
