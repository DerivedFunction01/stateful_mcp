# Filter Service Reference Guide

The Filter Service provides an incremental, version-controlled builder for database query clauses. This allows client LLMs to construct and tweak complex SQL conditions across multiple turns.

---

## 1. Decoupling Public Filters from Database Columns

A core design principle of the Filter Service is that **the client LLM should not know the internal database table structure or column names**. Instead, the LLM queries against logical, public-facing attribute definitions.

The **Translation Layer** maps these public queries into database column targets dynamically:
* Public attribute `email` maps to internal column `contact_email_address`.
* Public operator `is` maps to relational comparison `eq`.
* This decoupling allows database schemas to evolve (e.g. renaming columns, migrating tables) without breaking the LLM's client-facing tool configuration.

For full translation step mapping and compiler capabilities, refer to [docs/pipeline.md](file:///home/denny/lu/filter/docs/pipeline.md).

---

## 2. Version-Controlled Query Lifecycle

Every mutation on a filter creates a new, immutable state node (commit) tracked in the session's DAG:
* **`filter_init`**: Starts a root node specifying target tool/table and optional default conditions.
* **`filter_add`**: Appends logical clauses (`AND`/`OR`) and returns a new version ID.
* **`filter_inspect`**: Displays the active rules and compiled SQL representation at a specific version.
* **`filter_compress`**: Flattens a linear chain of version nodes to reduce session storage overhead.

---

## 3. Supported Dialects
* **SQLite**: Parameters are bound using index numbering (`?`).
* **PostgreSQL**: Parameters are compiled using position notation (`$1`, `$2`), and nested path syntax is compiled into JSONB arrow access operators (e.g. `metadata->>'status'`).
