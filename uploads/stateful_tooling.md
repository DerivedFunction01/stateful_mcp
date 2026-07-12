---
title: Stateful Tooling - Filter + Dictionary Middleware Architecture
description: For complex domains with evolving queries, domain-specific terminology, and multiple downstream tools operating on the same filtered data, use a Filter + Dictionary middleware layer to decouple query structure from tool logic.
---

## Filter + Dictionary Middleware Architecture

For complex domains with evolving queries, domain-specific terminology, and multiple downstream tools operating on the same filtered data, use a **Filter + Dictionary middleware layer** to decouple query structure from tool logic.

### Problem: Tool Parameter Bloat + Redundant Filtering

**Without middleware:**

- Each domain tool repeats filter parameters (property, operator, value)
- Each tool repeats GROUP BY/aggregation logic
- Each tool duplicates alias resolution (HTN vs. HTN_HIGH_BP)
- Tools become "fat" with conditional logic
- Most retail APIs are built for stateless web apps, not agentic workflows. When the agent queries a catalog API, that API is designed to return a result and "forget" the user ever asked.
- Because the previous API call didn't return a reference to a saved state, the agent throws away the previous results.
- Re-Contracting: The agent must re-issue a request that includes all the original constraints plus the new one. If a user wanted "Waterproof" + "Running" + "Blue" + "Under $150," the new call must include all four again.
- They are effectively forcing the agent to rebuild the entire context of the shopping intent every time the user changes their mind on a single parameter.

**Example (bloated):**

```
browse_catalog(category="shoes", max_price=150, min_price=0, attributes=["waterproof"], color=["blue"], sku="", limit=10)
medical_diagnosis(filters=[...], group_by=[...], limit=10)
inventory_rebalance(filters=[...], group_by=[...], limit=10)
```

Each tool owns the same filtering problem.

### Solution: Middleware Layers

**Layer 1: Dictionary** (Alias → Canonical Concept)

- Resolves non-standard terms to normalized concepts
- User/workspace-specific
- Separate from filter; only handles concept mapping

**Layer 2: Filter** (Middleware Query Engine)

- Discovers tool parameters dynamically
- Builds composable, versionable queries
- Returns a query reference (`view_id`) for downstream tools

**Layer 3: Domain Tools** (Lean Operations)

- Accept pre-filtered data via `view_id`
- No filtering logic; no parameter duplication
- Focused on domain-specific operations

**LLM Workflow:**

```
1. Non-standard term? → dictionary.find(term)
2. Discover filterable properties → filter.parameters(tool_name)
3. Build query → filter.init() → filter.add(...) → filter.init_view() → view_id
4. Execute → browse_catalog(view_id) or medical_diagnosis(view_id)
```

---

### Filter Server (MCP-Style Interface)

**Purpose:** Composable, versionable query builder that generates references to filtered datasets.

**Design Principle: Constrain at the Tool Schema Level**

```json
{
  "type": "object",
  "properties": {
    "filter_delta": {
      "type": "object",
      "properties": {
        "add_filters": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "property": {
                "type": "string",
                "description": "The property to filter on."
              },
              "operator": {
                "type": "string",
                "enum": [
                  "eq",
                  "neq",
                  "in_set",
                  "not_in_set",
                  "gt",
                  "geq",
                  "lt",
                  "leq",
                  "like",
                  "not_like",
                  "between",
                  "not_between"
                ],
                "description": "The SQL-like operator to use for the operation."
                // ✓ Only these operators allowed; no code/SQL
              },
              "value": {
                "type": ["string", "number", "array"],
                "description": "The value to use for filtering."
                // ✓ Backend validates type matches property
              }
            },
            "required": ["property", "operator", "value"]
          }
        }
      }
    }
  }
}
```

```json
{
  "type": "object",
  "description": "Defines the shape, aggregation, and sorting of a filtered dataset. Returns a mod_id.",
  "properties": {
    "projections": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "Specific properties to include in the output (SELECT). If grouping is applied, this must only include grouped columns or aggregated aliases. If omitted, returns all standard properties."
    },
    "group_by": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "Properties to group the dataset by."
    },
    "aggregations": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "function": {
            "type": "string",
            "enum": ["count", "sum", "avg", "min", "max", "count_distinct"],
            "description": "The mathematical function to apply."
          },
          "property": {
            "type": "string",
            "description": "The property to aggregate (e.g., 'price'). Use '*' for count."
          },
          "alias": {
            "type": "string",
            "description": "The output name for this aggregated metric (e.g., 'average_price')."
          }
        },
        "required": ["function", "property", "alias"]
      },
      "description": "Mathematical roll-ups to apply to grouped data."
    },
    "sort": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "property": {
            "type": "string",
            "description": "The property or aggregation alias to sort by."
          },
          "direction": {
            "type": "string",
            "enum": ["asc", "desc"],
            "default": "asc"
          }
        },
        "required": ["property"]
      },
      "description": "Multi-column sorting instructions. Applied after grouping and aggregations."
    }
  },
  "additionalProperties": false
}
```

**Core Operations:**

#### filter.init(tool_name, table_name)

Creates an empty filter checkpoint, optionally bound to a specific tool and table/view for early validation.

**Parameters:**

- `tool_name`: (optional) Target tool for this filter (e.g., "browse_catalog", "medical_diagnosis", "dictionary"). If provided, enables fast local validation of filter operations without API calls.
- `table_name`: (optional) Specific table or view within the tool (e.g., "menu_items", "order_history" for catalog tool; "entries", "history" for dictionary tool). If tool has multiple tables, this specifies which one. If omitted, defaults to tool's primary table.

**Returns:** `filter_id` (unique reference to this filter state, includes table binding)

**Example (Generic):**

```
filter.init()
→ "filter_v1_abc123"
```

**Example (Tool-Specific):**

```
filter.init(tool_name="browse_catalog")
→ "filter_v1_tool_browse_catalog_xyz"

# Now filter.add() can validate against browse_catalog's primary table schema locally
filter.add("filter_v1_tool_browse_catalog_xyz", 
  [{property: "category", operator: "in_set", value: ["electronics"]}]
)
→ Success (category is a valid filterable property for browse_catalog)
```

**Example (Tool + Specific Table):**

```
# Dictionary tool has two views: "entries" (normalized) and "history" (audit trail)
filter.init(tool_name="dictionary", table_name="entries")
→ "filter_v1_tool_dictionary_entries_abc"

filter.add("filter_v1_tool_dictionary_entries_abc", [
  {property: "term", operator: "like", value: "%usual%"},
  {property: "confidence", operator: "gt", value: 0.8}
])
→ "filter_v2_tool_dictionary_entries_def"
# Validated against dictionary.entries schema (term, canonical_concept, confidence, tags, etc.)

# Different view: audit history
filter.init(tool_name="dictionary", table_name="history")
→ "filter_v1_tool_dictionary_history_ghi"

filter.add("filter_v1_tool_dictionary_history_ghi", [
  {property: "action", operator: "eq", value: "add"},
  {property: "timestamp", operator: "gt", value: "2024-01-01"}
])
→ "filter_v2_tool_dictionary_history_jkl"
# Validated against dictionary.history schema (action, timestamp, dict_entry_id, user_id, etc.)
```

**Example (Cross-Domain with Tables):**

```
# Order history tool has order_items and order_metadata tables
filter.init(tool_name="order_history", table_name="order_items")
→ "filter_v1_orders_items"

filter.add("filter_v1_orders_items", [
  {property: "customer_id", operator: "eq", value: "bob_123"}
])
→ "filter_v2_orders_items_bob"

# Can also filter on metadata
filter.init(tool_name="order_history", table_name="order_metadata")
→ "filter_v1_orders_meta"

filter.add("filter_v1_orders_meta", [
  {property: "total_price", operator: "lt", value: 50}
])
→ "filter_v2_orders_meta_cheap"

# Combine across tables (if supported)
filter.combine("intersection", ["filter_v2_orders_items_bob", "filter_v2_orders_meta_cheap"])
→ "combined_bob_cheap_orders"
```

**Why bind to tool + table:**

- Validation is local and fast (no backend/database access)
- LLM learns property schema once via `filter.parameters(tool_name, table_name)`, reuses it during compilation
- Multiple tables in one tool each have distinct schemas and mock datasets
- Catch typos and schema mismatches early
- Tool-agnostic filters (no tool_name) still work for cross-tool combines
- Supports audit, history, and metadata views alongside primary data

#### filter.add(filter_id, operations)

Add or remove filter rules to an existing filter. If filter is tool-bound, validates operations against the tool's mock dataset.

**Parameters:**

- `filter_id`: Reference to previous filter state
- `operations`: Array of `{property, operator, value}` to add/remove

**Returns:** `new_filter_id` (immutable; old filter remains intact)

**Example (Tool-Bound Validation with Mock Execution):**

```
filter.init(tool_name="browse_catalog")
→ "filter_v1_tool_browse_catalog_abc123"

# Add first operation; validates locally against browse_catalog.filterable_properties
filter.add("filter_v1_tool_browse_catalog_abc123", [
  {property: "category", operator: "in_set", value: ["electronics", "appliances"]}
])
→ "filter_v2_tool_browse_catalog_def456"
# Validation: "category" is a valid property, "in_set" is a valid operator → Success

# Add second operation; validates against both schema AND executes against mock dataset
filter.add("filter_v2_tool_browse_catalog_def456", [
  {property: "price", operator: "lt", value: 500}
])
→ "filter_v3_tool_browse_catalog_ghi789"
# Validation: "price" is valid, "lt" is valid, both ops compose correctly on mock data → Success

# Try invalid operation
filter.add("filter_v3_tool_browse_catalog_ghi789", [
  {property: "price", operator: "not_supported_op", value: 999}
])
→ Error: "not_supported_op not in browse_catalog.operators" (caught locally before execution)

# Try operation that fails on mock data (e.g., aggregation without GROUP BY when required)
filter.add("filter_v3_tool_browse_catalog_ghi789", [
  {property: "price", operator: "avg", value: null}  # aggregation without grouping context
])
→ Error: "avg aggregation requires grouping context (use filter.init_modifier())" (caught on mock execution)
```

**Enables:**

- Undo/branch by referencing old `filter_id` + adding new operations
- Early detection of schema mismatches, type errors, and composition issues
- Mock execution validates semantics without backend cost

#### filter.get_filter(filter_id)

Retrieve the full definition of a saved filter.

**Returns:** `FilterObject` (all rules, modifiers, current state)

**Example:**

```
filter.get_filter("filter_v2_def456")
→ {
  "filter_id": "filter_v2_def456",
  "rules": [
    {property: "category", operator: "in_set", value: ["electronics", "appliances"]},
    {property: "price", operator: "lt", value: 500}
  ],
  "created_at": "...",
  "parent_filter_id": "filter_v1_abc123"
}
```

#### filter.compress(filter_id)

Collapse the filter chain into a new standalone filter with no parent. Materializes all rules from the ancestry into a single, saveable filter object.

**Parameters:**

- `filter_id`: Filter to compress (ancestry is resolved)

**Returns:** `compressed_filter_id` (new filter with `parent_filter_id: null`)

**Example:**

```
filter.compress("filter_v2_def456")
→ "filter_compressed_xyz789"

filter.get_filter("filter_compressed_xyz789")
→ {
  "filter_id": "filter_compressed_xyz789",
  "rules": [
    {property: "category", operator: "in_set", value: ["electronics", "appliances"]},
    {property: "price", operator: "lt", value: 500}
  ],
  "created_at": "...",
  "parent_filter_id": null
}
```

**Why compress:**

- Breaks immutable chain; enables independent persistence
- Saves storage (no need to keep ancestor filters for this branch)
- Makes filters safely shareable (standalone, no hidden dependencies)

#### filter.combine(operation, filter_ids_or_view_ids)

Combine multiple filters or views using set operations: union, intersection, difference, symmetric difference.

**Parameters:**

- `operation`: One of `"union"`, `"intersection"`, `"difference"`, `"symmetric_difference"`
    - `"union"`: Include rows matching ANY of the filters (OR logic)
    - `"intersection"`: Include rows matching ALL filters (AND logic)
    - `"difference"`: Rows in first filter but NOT in others (first - rest)
    - `"symmetric_difference"`: Rows in exactly one filter (XOR logic)
- `filter_ids_or_view_ids`: Array of filter or view IDs to combine (order matters for difference/symmetric_difference)

**Returns:** `combined_id` (new filter/view reference)

**Example (Union):**

```
# Two separate filters
filter.init() → "filter_v1_budget_electronics"
filter.add(..., [{property: "category", operator: "eq", value: "electronics"},
                 {property: "price", operator: "lt", value: 500}])
→ "filter_v2_budget_electronics"

filter.init() → "filter_v1_appliances"
filter.add(..., [{property: "category", operator: "eq", value: "appliances"},
                 {property: "price", operator: "lt", value: 1000}])
→ "filter_v2_appliances"

# Combine: budget electronics OR cheap appliances
filter.combine("union", ["filter_v2_budget_electronics", "filter_v2_appliances"])
→ "combined_v1_budget_items"
```

**Example (Intersection with Mock Validation):**

```
# Find items that are BOTH popular AND in stock
filter.init(tool_name="browse_catalog") → "filter_v1_tool_popular"
filter.add(..., [{property: "popularity", operator: "gt", value: 8.0}])
→ "filter_v2_tool_popular"

filter.init(tool_name="browse_catalog") → "filter_v1_tool_in_stock"
filter.add(..., [{property: "inventory", operator: "gt", value: 0}])
→ "filter_v2_tool_in_stock"

# Combine and validate on mock data
filter.combine("intersection", ["filter_v2_tool_popular", "filter_v2_tool_in_stock"])
→ "combined_v1_popular_and_in_stock"
# Mock execution: both filters execute on browse_catalog's mock dataset, intersection is computed → Success
```

**Example (Difference):**

```
# Premium items NOT in sale
filter.init() → "filter_premium"
filter.add(..., [{property: "tier", operator: "eq", value: "premium"}])
→ "filter_v2_premium"

filter.init() → "filter_on_sale"
filter.add(..., [{property: "discount", operator: "gt", value: 0}])
→ "filter_v2_on_sale"

filter.combine("difference", ["filter_v2_premium", "filter_v2_on_sale"])
→ "combined_v1_premium_full_price"  # premium items minus those on sale
```

**Why combine:**

- Compose complex queries from saved, reusable filters
- Avoid rebuilding the same filter logic repeatedly
- Enable A/B testing (one filter vs another vs both)
- Support workflow templates (standard filters combined in different ways)

#### filter.parameters(tool_name, table_name)

Discover what properties and operations a specific tool or table supports filtering on.

**Parameters:**

- `tool_name`: (e.g., "browse_catalog", "medical_diagnosis", "dictionary", "order_history")
- `table_name`: (optional) Specific table/view within the tool. If omitted, returns all available tables + primary table schema.

**Returns:** Tool's filterable interface(s)

**Example (Primary Table Only):**

```
filter.parameters("browse_catalog")
→ {
  "tool_name": "browse_catalog",
  "primary_table": "items",
  "available_tables": ["items", "reviews", "inventory"],
  "table_schema": {
    "items": {
      "filterable_properties": ["name", "sku", "price", "category", "brand", "popularity_index"],
      "operators": ["eq", "not_eq", "in_set", "not_in_set", "gt", "geq", "lt", "leq", "like", "not_like"],
      "groupable_columns": ["category", "brand", "price_range"],
      "aggregations": ["count", "sum", "avg", "min", "max"],
      "result_shape": "items",
      "max_results": 1000,
      "mock_dataset": [sample items]
    }
  }
}
```

**Example (Specific Table):**

```
filter.parameters("browse_catalog", table_name="reviews")
→ {
  "tool_name": "browse_catalog",
  "table_name": "reviews",
  "filterable_properties": ["item_id", "rating", "reviewer_id", "review_text", "date"],
  "operators": ["eq", "gt", "lt", "like"],
  "result_shape": "reviews",
  "mock_dataset": [sample reviews]
}
```

**Example (Multi-Table Tool: Dictionary):**

```
filter.parameters("dictionary")
→ {
  "tool_name": "dictionary",
  "available_tables": ["entries", "history"],
  "table_schemas": {
    "entries": {
      "filterable_properties": ["term", "canonical_concept", "confidence", "tags", "description"],
      "operators": ["eq", "like", "in_set"],
      "mock_dataset": [sample dictionary entries]
    },
    "history": {
      "filterable_properties": ["action", "timestamp", "dict_entry_id", "user_id", "old_value", "new_value"],
      "operators": ["eq", "gt", "lt", "like"],
      "mock_dataset": [sample history records]
    }
  }
}
```

**LLM uses this to:**

- Discover all available tables in a tool
- Learn what can be filtered without memorization
- Validate filter properties match tool + table capabilities
- Discover available GROUP BY columns dynamically
- Choose which table to query based on user intent

#### filter.init_modifier(filter_id)

Create a modifier (GROUP BY + SELECT projection schema).

**Parameters:**

- `filter_id`: (optional) Filter to apply modifier to; if null, modifier is independent

**Returns:** `mod_id` (modifier reference)

**Example:**

```
filter.init_modifier("filter_v2_def456")
→ "mod_v1_xyz789"
```

#### filter.modifier_add(mod_id, columns, aggregations)

Add or refine GROUP BY columns and aggregation functions.

**Parameters:**

- `mod_id`: Reference to existing modifier
- `columns`: Columns to group by (from filterable properties)
- `aggregations`: {column: aggregation_function}

**Returns:** `new_mod_id`

**Example:**

```
filter.modifier_add("mod_v1_xyz789", 
  columns=["category", "brand"],
  aggregations={"price": "avg", "quantity": "sum"}
)
→ "mod_v2_pqr012"
```

**Separates from filtering because:**

- WHERE clause (filters) ≠ GROUP BY + SELECT
- Modifier can be reused across multiple filters
- Enables composition: one filter + multiple modifiers

#### filter.init_view(filter_id, mod_id, having_id, limit, offset)

Materialize a view: combine filter + modifier + pagination + sorting.

**Parameters:**

- `filter_id`: (required) Which data to operate on
- `mod_id`: (optional) How to aggregate/project
- `having_id`: (optional) Which having clause to apply
- `limit`: Result limit
- `offset`: Pagination offset

**Returns:** `view_id` (reference to materialized query result)

**Example:**

```
filter.init_view(
  filter_id="filter_v2_def456",
  mod_id="mod_v2_pqr012",
  having_id="having_v1_xyz123",
  limit=50,
  offset=0,
)
→ "view_v1_jkl345"
```

#### filter.save_filter(filter_id or view_id, tags, description)

Persist a compressed filter or view for reuse.

**Parameters:**

- `filter_id` or `view_id`: What to save (should be compressed for independent persistence)
- `tags`: Array of tags for discovery (e.g., ["electronics", "budget"])
- `description`: Human-readable description

**Returns:** Saved ID (same as input, now persistent)

**Example (typical workflow with tool-specific filter):**

```
# Build filter incrementally, bound to a tool
filter.init(tool_name="browse_catalog") → "filter_v1_tool_browse_catalog_abc"
filter.add(...) → "filter_v2_tool_browse_catalog_def"
filter.add(...) → "filter_v3_tool_browse_catalog_ghi"

# Compress to standalone
filter.compress("filter_v3_tool_browse_catalog_ghi") → "filter_compressed_xyz"

# Save the compressed filter
filter.save_filter(
  filter_id="filter_compressed_xyz",
  tags=["electronics", "under_500", "popular"],
  description="Budget electronics for retail team"
)
→ "filter_compressed_xyz" (now persisted, parent_filter_id: null)
```

---

### Validation Architecture: Mock Execution

**Purpose:** Catch errors early by executing filters on mock datasets before materialization.

**How it works:**

1. **tool.parameters(tool_name, table_name) returns table schema + mock data**
      ```
      filter.parameters("dictionary", table_name="entries")
      → {
          "tool_name": "dictionary",
          "table_name": "entries",
          "filterable_properties": ["term", "canonical_concept", "confidence", "tags"],
          "operators": [...],
          "mock_dataset": {  # Specific to this table
            "row_count": 50,
            "sample_rows": [
              {term: "the usual thing", canonical_concept: "HTN_HIGH_BP", confidence: 0.95, tags: ["diagnosis"]},
              {term: "blue pill", canonical_concept: "MEDICATION_X", confidence: 0.8, tags: ["medication"]},
              ...
            ]
          }
        }

   
   filter.parameters("dictionary", table_name="history")
   → {
       "tool_name": "dictionary",
       "table_name": "history",
       "filterable_properties": ["action", "timestamp", "dict_entry_id", "user_id"],
       "operators": [...],
       "mock_dataset": {
         "row_count": 100,
         "sample_rows": [
           {action: "add", timestamp: "2024-06-15T10:30:00", dict_entry_id: "dict_e1_abc", user_id: "clinician_smith"},
           {action: "update", timestamp: "2024-06-16T14:22:00", dict_entry_id: "dict_e1_abc", user_id: "clinician_jones"},
           ...
         ]
       }
     }
   ```

2. **filter.init(tool_name, table_name) binds to specific table**
      - LLM chooses table based on query intent
      - Validation uses that table's schema and mock dataset
      - Example: "Show me recent dictionary changes" → init with `table_name="history"`

3. **filter.add() executes filter against the correct mock data**
      - Validates schema (property names, operators match the table)
      - Executes the filter logic on that table's sample rows
      - Detects composition errors early
      - Returns success or error immediately (no backend call)

4. **filter.combine() validates composition across tables (if compatible)**
      - Runs filters on their respective tables' mock data
      - If combining filters from different tools/tables, validates schema compatibility
      - Catches type mismatches and incompatibilities early

5. **Example flow (Dictionary Tool):**
      ```
      # LLM discovers dictionary has two tables
      filter.parameters("dictionary")
      → {"available_tables": ["entries", "history"]}

   
   # User: "Show me recent changes to the dictionary"
   # LLM chooses the right table
   filter.init(tool_name="dictionary", table_name="history")
   → "filter_v1_tool_dictionary_history_xyz"

   
   # Schema validation (fast)
   filter.add("filter_v1_tool_dictionary_history_xyz", 
     [{property: "timestamp", operator: "gt", value: "2024-06-01"}]
   )
   → Check: "timestamp" in dictionary.history.filterable_properties? Yes → Continue

   
   # Execution validation (mock)
   → Execute on dictionary.history's mock dataset
   → Verify result makes sense
   → No actual database query

   
   → "filter_v2_tool_dictionary_history_abc" (validated)
   ```

**Benefits:**

- Compile-time error detection (not runtime)
- Zero backend load during query building
- LLM can safely iterate and refine filters
- Confidence that complex combines will work before materialization

---

### Cross-Domain Application: Catalog + Orders

The Filter middleware isn't limited to query filters. Any tool that operates on structured data can expose a filterable interface and consume `view_id` references.

**Example: Menu Catalog + Order Management**

**Step 1: Bob builds a menu filter**

```
# Discover what's filterable on the menu
filter.parameters("menu_catalog")
→ {
  "filterable_properties": ["name", "category", "price", "rating", "available", "allergens"],
  "operators": ["eq", "in_set", "gt", "lt", "contains"],
  "mock_dataset": [sample menu items]
}

# Bob: "I want popular items with X, Y, Z"
filter.init(tool_name="menu_catalog") → "filter_v1_bob_menu"
filter.add("filter_v1_bob_menu", [
  {property: "rating", operator: "gt", value: 4.5},
  {property: "allergens", operator: "not_in_set", value: ["X", "Y", "Z"]}
])
→ "filter_v2_bob_menu"

# Materialize the menu selection
filter.init_view("filter_v2_bob_menu", limit=20)
→ "view_bob_menu"

# Bob places orders from view_bob_menu items
menu_catalog(view_id="view_bob_menu")
→ Returns: [Popular item 1, Popular item 2, ...]

Bob orders: [item_a, item_b, item_c]  # Three items from the filtered menu
```

**Step 2: Charlie references Bob's orders**

```
# Discover what's filterable on the order history
filter.parameters("order_history")
→ {
  "filterable_properties": ["customer_name", "items_ordered", "total_price", "date", "status"],
  "operators": ["eq", "in_set", "gt", "lt", "contains"],
  "mock_dataset": [sample orders]
}

# Charlie: "I want everything Bob ordered"
filter.init(tool_name="order_history") → "filter_v1_charlie_orders"
filter.add("filter_v1_charlie_orders", [
  {property: "customer_name", operator: "eq", value: "Bob"}
])
→ "filter_v2_charlie_orders"

# Materialize Bob's order history
filter.init_view("filter_v2_charlie_orders")
→ "view_bob_orders"

# Get Bob's past orders
order_history(view_id="view_bob_orders")
→ Returns: [Bob's order 1: [item_a, item_b, item_c], Bob's order 2: [...], ...]

# Now Charlie can add to this filter OR use it to construct a new menu filter
filter.init(tool_name="menu_catalog") → "filter_v1_charlie_menu"

# Build Charlie's selection from Bob's items
filter.add("filter_v1_charlie_menu", [
  {property: "name", operator: "in_set", value: ["item_a", "item_b", "item_c"]}
])
→ "filter_v2_charlie_menu"

# Charlie can add more criteria
filter.add("filter_v2_charlie_menu", [
  {property: "price", operator: "lt", value: 25}
])
→ "filter_v3_charlie_menu"

# Materialize
filter.init_view("filter_v3_charlie_menu")
→ "view_charlie_menu"

menu_catalog(view_id="view_charlie_menu")
→ Returns: Bob's items that are under $25
```

**Key insight:** The filter middleware decouples the _selection logic_ from the _domain tool_. The same `filter_add()`, `filter_combine()`, `filter_compress()` operations work across:

- Product catalogs
- Order history
- User profiles
- Inventory
- Any structured dataset

**Benefits across domains:**

1. **Reusable selection patterns** — Bob's popular-items filter is a composable artifact; Charlie can reference, extend, or combine it with others
2. **Cross-domain composition** — Filter on orders to find popular items, then filter the catalog by those items (order → menu pipeline)
3. **Audit trail** — Every filter operation logged; know exactly what criteria Bob used
4. **Consistency** — Dictionary applies across all domains (e.g., "X, Y, Z" allergens map to canonical codes in both catalog and order systems)

---

**Purpose:** Generic middleware to resolve domain-specific terminology and aliases to canonical concepts. Decouples user input (vernacular, shortcuts, context-specific terms) from backend tool parameters.

**Core Operations:**

#### dictionary.add(term, canonical_concept, tags, description, workspace_id)

Register a new alias mapping (typically error-driven; user clarifies after tool rejection).

**Parameters:**

- `term`: Non-standard term or alias (e.g., "the usual thing", "red item", "Q4 bundle")
- `canonical_concept`: What it maps to (e.g., "HTN_HIGH_BP", "SKU_PREMIUM_RED", "PROMO_Q4_2024")
- `tags`: Domain tags (e.g., ["diagnosis", "hypertension"] or ["inventory", "color", "premium"])
- `description`: Why this mapping exists
- `workspace_id`: Whose workspace this belongs to (user, team, or org)

**Returns:** `dict_entry_id`

**Example (Medical):**

```
dictionary.add(
  term="the usual thing",
  canonical_concept="HTN_HIGH_BP",
  tags=["diagnosis", "hypertension"],
  description="Clinician Smith's shorthand for hypertension",
  workspace_id="workspace_doc_smith_123"
)
→ "dict_e1_abc"
```

**Example (E-commerce):**

```
dictionary.add(
  term="red item",
  canonical_concept="COLOR_RED",
  tags=["inventory", "color", "attribute"],
  description="Sales team shorthand for red color inventory filter",
  workspace_id="workspace_sales_team"
)
→ "dict_e2_def"
```

#### dictionary.find(query, workspace_id)

Search for aliases matching a query (supports multiple query types).

**Parameters:**

- `query`: Can be:
    - `string`: Keyword search (e.g., "the usual thing")
    - `tags`: Tag-based search (e.g., tags=["diagnosis", "HTN"])
    - `concept_type`: Concept class (e.g., "diagnosis")
- `workspace_id`: Whose dictionary to search

**Returns:** Array of matching entries

**Example:**

```
dictionary.find(query="the usual thing", workspace_id="workspace_doc_smith_123")
→ [
  {
    "term": "the usual thing",
    "canonical_concept": "HTN_HIGH_BP",
    "tags": ["diagnosis", "hypertension"],
    "confidence": "high",
    "dict_entry_id": "dict_e1_abc"
  }
]
```

#### dictionary.resolve(term, workspace_id)

Quick lookup: return canonical concept for a term (or null if not found).

**Parameters:**

- `term`: The alias to resolve
- `workspace_id`: Whose dictionary

**Returns:** `canonical_concept` or `null`

**Example:**

```
dictionary.resolve("the usual thing", workspace_id="workspace_doc_smith_123")
→ "HTN_HIGH_BP"
```

#### dictionary.remove(dict_entry_id)

Delete a specific dictionary entry.

**Parameters:**

- `dict_entry_id`: Entry to remove

**Returns:** Confirmation

**Example:**

```
dictionary.remove("dict_e1_abc")
→ {"removed": true}
```

---

### LLM Integration: Complete Workflow Example

#### Scenario: Medical Diagnosis with Custom Aliases (Application of Generic Dictionary)

**User Input:** "Show me the usual thing diagnoses in blue pill patients under 50"

**Step 1: Resolve Aliases (Dictionary)**

```
dictionary.resolve("the usual thing", workspace_id="workspace_doc_smith_123")
→ "HTN_HIGH_BP"

dictionary.resolve("blue pill patients", workspace_id="workspace_doc_smith_123")
→ null (not in dictionary)
→ LLM clarifies with clinician: "What do you mean by 'blue pill patients'?"
→ Clinician: "Patients on MEDICATION_X_CODE"
→ dictionary.add("blue pill patients", "MEDICATION_X_CODE", tags=["medication"], workspace_id="workspace_doc_smith_123")
```

**Step 2: Discover Tool Parameters**

```
filter.parameters("medical_diagnosis")
→ {
  "filterable_properties": ["diagnosis_code", "medication_code", "age", "date", "severity"],
  "operators": ["eq", "in_set", "gt", "lt"],
  "groupable_columns": ["diagnosis_code", "severity", "age_group"],
  "result_shape": "diagnoses"
}
```

**Step 3: Build Filter (with early validation)**

```
# Init filter bound to medical_diagnosis tool
filter.init(tool_name="medical_diagnosis")
→ "filter_v1_tool_medical_diagnosis_abc"

# Add operations; validation happens locally against medical_diagnosis.filterable_properties
filter.add("filter_v1_tool_medical_diagnosis_abc", [
  {property: "diagnosis_code", operator: "eq", value: "HTN_HIGH_BP"},
  {property: "medication_code", operator: "eq", value: "MEDICATION_X_CODE"},
  {property: "age", operator: "lt", value: 50}
])
→ "filter_v2_tool_medical_diagnosis_def"
# No API call; validation was local (age, medication_code, diagnosis_code all in filterable_properties)
```

**Step 4: Create View**

```
filter.init_view(
  filter_id="filter_v2_tool_medical_diagnosis_def",
  limit=50
)
→ "view_v1_xyz"
```

**Step 5: Call Domain Tool**

```
medical_diagnosis(view_id="view_v1_xyz")
→ Results (pre-filtered, no redundant logic in tool)
```

---

### Key Benefits

1. **Tool Simplification:** Domain tools accept only `view_id`; no filter parameter duplication
2. **Discovery-Driven:** LLM learns capabilities from `filter.parameters()`, not prompts
3. **Early Validation:** Optional tool binding at `filter.init(tool_name)` enables fast, local schema validation on `filter.add()` without backend calls
4. **Immutable Versioning:** Old filters stay accessible; enables undo/branch during exploration
5. **Compress for Persistence:** `filter.compress()` breaks the chain, enabling independent saving without ancestry baggage
6. **Composable Filters:** `filter.combine()` enables set-theoretic operations (union, intersection, difference) to build complex queries from reusable pieces
7. **Alias Normalization:** Dictionary learns from errors; users only clarify once per term
8. **Reusability:** Compressed, saved filters enable template workflows and can be combined in multiple ways
9. **Auditability:** Every filter operation and dictionary entry is logged with ID + timestamp
10. **Separation of Concerns:**
       - Filter owns structure (WHERE, GROUP BY, HAVING, SORT) and composition
       - Dictionary owns terminology (aliases → concepts)
       - Domain tools own operations (logic on filtered data)
11. **Generic & Extensible:** Dictionary and Filter work across any domain—medical, e-commerce, inventory, etc.

---

### When to Use This Pattern

✓ **Use Filter + Dictionary when:**

- Multiple tools operate on the same filtered data
- Domain-specific terminology and user shortcuts exist
- Query logic is complex (filters, grouping, aggregations)
- You want to avoid repeating filter logic across tools
- Filtering is stateful or expensive (worth caching via view_id)
- Users bring domain vernacular that doesn't map 1:1 to backend concepts
- **Cross-domain workflows** where selections from one domain (e.g., orders) inform another (e.g., catalog)
- **Selection reuse** where one user's filter becomes a template for others (Bob's menu → Charlie's order)

✗ **Don't use when:**

- Tools have trivial or single-use filters
- No aliasing/terminology resolution needed
- Filtering is cheap; no benefit to materialized views
- Single tool operating on specialized backend (no reuse case)
- Data is unstructured or non-tabular (documents, images, etc.)

---

### Implementation Notes

**Filter Backend:**

- Store filter checkpoints immutably (append-only log or snapshot)
- `view_id` references a materialized query result (cache or on-demand)
- Prune old filters/views based on retention policy

**Dictionary Backend:**

- Workspace-specific key-value store (simple lookup table)
- Error handling: When a tool rejects a code, log it + suggest dictionary.add()
- Tag indexing for fast `dictionary.find(tags=[...])`
- Support multiple workspaces with isolation (workspace_id as partition key)
