# Variable Service: Strategy & Guidelines

The Variable Service manages transient variable bindings (`{x=10, y=20}`) and in-process execution scopes for active sessions and template blocks.

## Rules of Engagement

* **Batch & Array Variable Registration**: Use `setVariables` (`variable_mutate`) to bind multiple variables at once using either key-value dict objects (`{x: 10, y: 20}`) or array entry objects (`[{ key: "x", value: 10 }, { key: "y", value: 20 }]`).
* **Condition Rule Testing**: Store variables with condition rules (e.g. `{ key: "x", condition: { op: "leq", target_value: 20 } }`), then evaluate test values using `variable_test` (`key: "x", test_value: 25` $\rightarrow$ `passed: false`).
* **Multi-Key Deletion**: Delete single or multiple variables at once by passing a single key or array of keys to `deleteVariable` (`variable_remove`).
* **Block Scope Isolation**: Provide `blockInstanceId` when operating inside a specific template block or sub-workflow to isolate variables from the global session scope.
* **Scope Hierarchy**: The engine automatically resolves variables by checking the active **Block Instance Scope** first, falling back to the **Global Session Scope**.
* **AST Evaluation**: Use `evaluatePipeline` (`variable_eval`) to execute deterministic math, string, date, or comparison expressions against active variable scopes without raw shell execution.
