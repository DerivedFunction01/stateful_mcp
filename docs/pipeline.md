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

### Arithmetic Operations (Variadic)
Used to modify or combine numeric field values across arbitrary length arrays of arguments (`args`):
* **`add`**: Sums all arguments in `args`. E.g. `{ "op": "add", "args": [1, 2, 5, 7] }` $\rightarrow `15`.
* **`sub`**: Sequential left-associative subtraction. E.g. `{ "op": "sub", "args": [20, 5, 3] }` $\rightarrow `12`. Single arg `[5]` $\rightarrow `-5`.
* **`mul`**: Multiplies all arguments. E.g. `{ "op": "mul", "args": [2, 3, 4] }` $\rightarrow `24`.
* **`div`**: Sequential left-associative division. E.g. `{ "op": "div", "args": [100, 2, 5] }` $\rightarrow `10`.
* **`mod`**: Sequential left-associative modulo (remainder). E.g. `{ "op": "mod", "args": [100, 30, 7] }` $\rightarrow `3`.
* **`exp`**: Sequential left-associative exponentiation ($((a^b)^c)$). E.g. `{ "op": "exp", "args": [2, 3, 2] }` $\rightarrow `64`.
* **`round`**: Rounds number to specified decimal places (default 0). E.g. `{ "op": "round", "args": [12.3456, 2] }` $\rightarrow `12.35`.
* **`ceil`**: Computes ceiling of a number.
* **`floor`**: Computes floor of a number.

### Comparison Operations (Chained Variadic)
Performs boolean comparisons across $N \ge 2$ arguments using Lisp-style monotonic sequence checking:
* **`lt`** ($<$): Strictly increasing sequence ($a < b < c$).
* **`leq`** ($\le$): Monotonically non-decreasing sequence ($a \le b \le c$). E.g. `{ "op": "leq", "args": [0, { "$init": "val" }, 100] }` $\rightarrow (0 \le val \land val \le 100)$.
* **`eq`** ($=$): All arguments equal ($a = b = c$). E.g. `{ "op": "eq", "args": [{ "$init": "x" }, { "$init": "y" }, { "$init": "z" }] }`.
* **`neq`** ($\ne$): All arguments pairwise distinct ($a \ne b \ne c$).
* **`geq`** ($\ge$): Monotonically non-increasing sequence ($a \ge b \ge c$).
* **`gt`** ($>$): Strictly decreasing sequence ($a > b > c$).

### Type Conversion Operations
Casts field values into target primitive types:
* **`to_string`**: Casts input value to string. E.g. `{ "op": "to_string", "args": [{ "$init": "id" }] }`.
* **`to_number`**: Casts value to number with optional mode (`"float"` default, or `"int"`/`"integer"`). E.g. `{ "op": "to_number", "args": [{ "$init": "str_num" }, "int"] }`.

### String & Pattern Operations
Manipulates and searches text strings or array fields:
* **`starts_with`**: Checks if target string starts with *any* of the provided prefix patterns. E.g. `{ "op": "starts_with", "args": [{ "$init": "url" }, "http://", "https://"] }`.
* **`ends_with`**: Checks if target string ends with *any* of the provided suffix patterns. E.g. `{ "op": "ends_with", "args": [{ "$init": "file" }, ".jpg", ".png"] }`.
* **`contains`**: Variadic pattern search over strings or arrays with optional `"all"` (default) or `"any"` match mode. E.g. `{ "op": "contains", "args": [{ "$init": "notes" }, "fever", "cough", "all"] }`.
* **`substring`**: Extracts substring slice `(str, start, length?)`. E.g. `{ "op": "substring", "args": [{ "$init": "text" }, 0, 10] }`.
* **`trim`**: Strips leading and trailing whitespace.
* **`lower`**: Converts string to lowercase.
* **`upper`**: Converts string to uppercase.
* **`concat`**: Concatenates $N$ arguments into a single string. E.g. `{ "op": "concat", "args": [{ "$init": "first" }, " ", { "$init": "last" }] }`.

### Date Operations
Parses and extracts calendar details from ISO date strings:
* **`year`**: Extracts year. E.g. `{ "op": "year", "args": [{ "$init": "value" }] }` (returns e.g. `2026`).
* **`month`**: Extracts month index (`1` to `12`).
* **`day`**: Extracts calendar day of the month (`1` to `31`).
* **`quarter`**: Extracts quarter index (`1` to `4`).
* **`date_diff`**: Days between two dates. E.g. `{ "op": "date_diff", "args": [{ "$init": "value" }, { "$fn": "now" }] }`

### Nested Access & JSON Operations
Allows parsing and exploring nested JSON structures:
* **`json_parse`**: Deserializes a raw JSON string into a structured object.
* **`get`**: Accesses a property at a specific key path on an object.
  * E.g. `{ "op": "get", "args": [{ "$var": "parsed_object" }, "metadata", "authors", 0] }`

