# Query Compilation & Translation Pipeline

This document explains how user-defined query filters are translated and compiled into execution-ready database commands (SQLite/Postgres).

---

## 1. The Pipeline Flow

```
┌─────────────────┐
│ Filter State ID │ (VCS Commit Node)
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ project() State │ (Topological project of all rules)
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ translate()     │ (Dynamic dialect field & operator mapping)
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ compile()       │ (SQL generator: Postgres / SQLite)
└─────────────────┘
```

---

## 2. Dynamic Translation Mapping (`translation`)

The `translation` property on a tool defines how user-supplied field identifiers and operators are preprocessed before being passed to the SQL generator.

### Example Translation Schema
A translation map is configured using the `TableTranslation` schema structure under `properties`:

```json
{
  "properties": {
    "customer_name": {
      "internal": "billing_name",
      "allowed_operators": ["eq", "neq"]
    },
    "age": {
      "internal": "birth_date",
      "transform": {
        "pipeline": [
          {
            "op": "date_diff",
            "args": [{ "$init": "value" }, { "$fn": "now" }],
            "return_var": "calculated_age"
          }
        ]
      }
    }
  }
}
```

* **`internal`**: Maps the public field name (e.g. `customer_name`) to its internal database column (e.g. `billing_name`).
* **`allowed_operators`**: Narrows down which operator families can be queried on the field (e.g. only allowing `eq` and `neq` on name fields).
* **`transform`**: Defines pipeline conversion steps using arithmetic, date, or nested JSON operations to transform values dynamically before compilation.
* **`$fn` Reference**: Represents dynamic system values evaluated at run time:
  - `{ "$fn": "now" }`: Resolves to the current date string (`YYYY-MM-DD`). Compiles to `date('now')` in SQLite and `CURRENT_DATE` in PostgreSQL.
  - `{ "$fn": "utc_time" }`: Resolves to the current UTC timestamp string (`ISO 8601`). Compiles to `datetime('now')` in SQLite and `CURRENT_TIMESTAMP` in PostgreSQL.

---

## 3. SQL Compilation Engines

The middleware compiles the final logical state into target database dialects:

### SQLite Engine
* Compiles logical operations (e.g. `like`, `geq`) to standard ANSI SQL parameters.
* Validates properties against the registered `table_schemas` in `tools.config.json` before execution.

### PostgreSQL Engine
* Generates dialect-safe parameterized SQL (`$1`, `$2`, etc.) to prevent SQL injection.
* Supports nested JSONB path queries (e.g. `meta->>'source'`) automatically.

---

## 4. Available Pipeline Operators (`OpName`)

The following operators can be used within translation pipelines. They are categorized by family:

### Arithmetic Operations
Used to modify or combine numeric field values.
* **`add`**: Sums two numbers. E.g. `{ "op": "add", "args": [{ "$init": "value" }, 10] }`
* **`sub`**: Subtracts second argument from first.
* **`mul`**: Multiplies two numbers.
* **`div`**: Divides first argument by second.
* **`mod`**: Modulo arithmetic (remainder).
* **`exp`**: Exponential power ($x^y$).

### Comparison Operations
Performs boolean comparisons.
* **`lt`** ($<$), **`leq`** ($\le$), **`eq`** ($=$), **`neq`** ($\ne$), **`geq`** ($\ge$), **`gt`** ($>$).
* E.g. `{ "op": "gt", "args": [{ "$init": "value" }, 100] }`

### Date Operations
Parses and extracts calendar details from ISO date strings.
* **`year`**: Extracts year. E.g. `{ "op": "year", "args": [{ "$init": "value" }] }` (returns e.g. `2026`).
* **`month`**: Extracts month index (`1` to `12`).
* **`day`**: Extracts calendar day of the month (`1` to `31`).
* **`quarter`**: Extracts quarter index (`1` to `4`).
* **`date_diff`**: Days between two dates. E.g. `{ "op": "date_diff", "args": [{ "$init": "value" }, { "$fn": "now" }] }`

### Nested Access & JSON Operations
Allows parsing and exploring nested JSON structures.
* **`json_parse`**: Deserializes a raw JSON string into a structured object.
* **`get`**: Accesses a property at a specific key path on an object.
  * E.g. `{ "op": "get", "args": [{ "$var": "parsed_object" }, "metadata", "authors", 0] }`

