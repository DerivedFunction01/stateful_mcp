# Stateful Middleware: Client-Side Browser Storage

This guide explains how to run the stateful middleware (Filters, Objects, Forms) directly in web browsers (e.g., in React, Vue, Svelte, or vanilla SPAs) utilizing native browser storage APIs.

---

## 1. Premade Storage Drivers

The package provides two pre-configured storage drivers optimized for browser environments:

### LocalStorage (`localStorage`)
*   **Best for**: Simple state preservation, small questionnaires, or persistent user preferences that don't change rapidly.
*   **Classes**:
    *   `LocalStorageSessionStore` (implements `SessionFilterStore`, `SessionObjectStore`, `SessionFormStore`)
    *   `LocalStoragePersistentStore` (implements `PersistentFilterStore`, `PersistentObjectStore`, `PersistentFormStore`)

### IndexedDB (`indexedDB`)
*   **Best for**: Highly active workloads, large state objects, event mutation logging, and transactional safety. Runs asynchronously on a separate thread.
*   **Classes**:
    *   `IndexedDbSessionStore` (implements `SessionFilterStore`, `SessionObjectStore`, `SessionFormStore`)
    *   `IndexedDbPersistentStore` (implements `PersistentFilterStore`, `PersistentObjectStore`, `PersistentFormStore`)

---

## 2. Programmatic Integration Example

To run a form engine or filter manager inside a browser app, import the stores and the browser adapters directly:

```typescript
import { IndexedDbSessionStore, IndexedDbPersistentStore } from "stateful-mcp/adapters/browser-repo";
import { FormStore } from "stateful-mcp/middleware/form";
import type { FormSchema } from "stateful-mcp/config/types";

// 1. Initialize IndexedDB database stores
const dbName = "user_questionnaires";
const sessionStore = new IndexedDbSessionStore(dbName);
const persistentStore = new IndexedDbPersistentStore(dbName);

// 2. Define your schema
const intakeSchema: FormSchema = {
  form_id: "medical_intake",
  start_question: "q_name",
  questions: {
    q_name: {
      text: "Please enter your name",
      answer_type: "free_text",
      required: true
    }
  }
};

const schemas = new Map([["medical_intake", intakeSchema]]);

// 3. Create the FormStore engine
const formStore = new FormStore(sessionStore, persistentStore, schemas);

// 4. Initialize and use the store programmatically in your component
const sessionId = "current-user-session";
const formId = await formStore.init("medical_intake", sessionId, "current_intake");

// Answer a question
const result = await formStore.answer(formId, "q_name", "Alice Cooper", sessionId);
console.log("Form Status:", result.complete ? "Completed!" : "More questions remaining.");
```

---

## 3. Writing Custom Browser Storage Adapters

If you want to use custom storage engines such as **SQLite WASM**, **RxDB**, or a cloud-synchronized database (like **PouchDB/CouchDB**), you can write a class implementing the repository interfaces exported by `stateful-mcp/adapters/storage/interfaces`:

```typescript
import { SessionFormStore } from "stateful-mcp/adapters/storage/interfaces";
import type { FormState } from "stateful-mcp/middleware/form/types";

export class MySqliteWasmFormStore implements SessionFormStore {
  async get(sessionId: string, id: string): Promise<FormState | null> {
    // Execute SQL WASM: SELECT state FROM form_sessions WHERE session_id = ? AND id = ?
  }

  async create(sessionId: string, state: FormState, alias?: string): Promise<string> {
    // Insert state record and return generated ID
  }

  async set(sessionId: string, id: string, state: FormState): Promise<void> {
    // Update state record
  }

  async delete(sessionId: string, id: string): Promise<void> {
    // Delete state record
  }

  // ... implement setAlias, getAlias, and listing methods
}
```
Because the middleware uses Dependency Inversion, any custom class satisfying the TypeScript contract is fully compatible.
