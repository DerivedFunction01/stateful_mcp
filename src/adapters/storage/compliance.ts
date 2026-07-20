import { FormStore } from "../../middleware/form/store";
import { ObjectStore } from "../../middleware/object/store";
import { EventStore } from "../../middleware/event/store";
import type { FormSchema } from "../../config/types";

export interface ComplianceRunnerOptions {
  name: string;
  createSessionStore: () => Promise<any>;
  createPersistentStore: () => Promise<any>;
  test: (name: string, fn: () => Promise<void> | void) => void;
  expect: any;
}

export function runStoreComplianceTests(options: ComplianceRunnerOptions) {
  const { test, expect, createSessionStore, createPersistentStore } = options;

  test(`${options.name} - ID Uniqueness & Collision Resistance`, async () => {
    const sessionStore = await createSessionStore();
    const sessionId = "comp-unique-id";

    // 1. Create a state
    const stateA = { filterId: "", rules: [], createdAt: new Date().toISOString() };
    const idA = await sessionStore.create(sessionId, stateA);

    // 2. Delete it
    await sessionStore.delete(sessionId, idA);

    // 3. Create another state. If the adapter uses rows.length or similar index,
    // it would produce a clashing key.
    const stateB = { filterId: "", rules: [], createdAt: new Date().toISOString() };
    const idB = await sessionStore.create(sessionId, stateB);

    expect(idB).not.toBe(idA);

    const retrievedB = await sessionStore.get(sessionId, idB);
    expect(retrievedB).not.toBeNull();
  });

  test(`${options.name} - Multiple Active States Isolation`, async () => {
    const sessionStore = await createSessionStore();
    const sessionId = "comp-isolation";

    const stateA = { filterId: "", rules: [], toolName: "tool-A", createdAt: new Date().toISOString() };
    const idA = await sessionStore.create(sessionId, stateA);

    const stateB = { filterId: "", rules: [], toolName: "tool-B", createdAt: new Date().toISOString() };
    const idB = await sessionStore.create(sessionId, stateB);

    const retrievedA = await sessionStore.get(sessionId, idA);
    const retrievedB = await sessionStore.get(sessionId, idB);

    expect(retrievedA).not.toBeNull();
    expect(retrievedB).not.toBeNull();
    expect(retrievedA.toolName).toBe("tool-A");
    expect(retrievedB.toolName).toBe("tool-B");
  });

  test(`${options.name} - Alias Operations & Routing`, async () => {
    const sessionStore = await createSessionStore();
    const sessionId = "comp-alias";

    const stateA = { filterId: "", rules: [], value: "A", createdAt: new Date().toISOString() };
    const idA = await sessionStore.create(sessionId, stateA, "my-alias");

    // Retrieve alias
    const targetA = await sessionStore.getAlias(sessionId, "my-alias");
    expect(targetA).toBe(idA);

    // Reassign alias
    const stateB = { filterId: "", rules: [], value: "B", createdAt: new Date().toISOString() };
    const idB = await sessionStore.create(sessionId, stateB);
    await sessionStore.setAlias(sessionId, "my-alias", idB);

    const targetB = await sessionStore.getAlias(sessionId, "my-alias");
    expect(targetB).toBe(idB);

    // Delete alias must not delete the target state
    await sessionStore.deleteAlias(sessionId, "my-alias");
    const targetAfterDel = await sessionStore.getAlias(sessionId, "my-alias");
    expect(targetAfterDel).toBeNull();

    const stateStillExists = await sessionStore.get(sessionId, idB);
    expect(stateStillExists).not.toBeNull();
  });

  test(`${options.name} - ID Referencing & Lookups`, async () => {
    const sessionStore = await createSessionStore();
    const sessionId = "comp-lookup";

    const state = { filterId: "", rules: [], toolName: "q1", createdAt: new Date().toISOString() };
    const id = await sessionStore.create(sessionId, state);

    const retrieved = await sessionStore.get(sessionId, id);
    expect(retrieved).not.toBeNull();
    expect(retrieved.toolName).toBe("q1");
  });

  test(`${options.name} - VCS & Parent-Child Integrity`, async () => {
    const sessionStore = await createSessionStore();
    const sessionId = "comp-vcs";

    // Parent
    const parent = { filterId: "", rules: [], createdAt: new Date().toISOString() };
    const parentId = await sessionStore.create(sessionId, parent);

    // Child
    const child = { filterId: "", parentFilterId: parentId, rules: [], createdAt: new Date().toISOString() };
    const childId = await sessionStore.create(sessionId, child);

    const children = await sessionStore.listChildren(sessionId, parentId);
    expect(children).toContain(childId);
  });

  test(`${options.name} - Expiration Boundaries`, async () => {
    const sessionStore = await createSessionStore();
    const sessionId = "comp-expiry";

    const state = {
      filterId: "",
      rules: [],
      toolName: "active",
      createdAt: new Date().toISOString()
    };
    const id = await sessionStore.create(sessionId, state);

    // Expire the session (clears the session)
    await sessionStore.expireSession(sessionId);

    const retrieved = await sessionStore.get(sessionId, id);
    expect(retrieved).toBeNull();
  });

  test(`${options.name} - Persistent Storage Tags & Lists`, async () => {
    const persistentStore = await createPersistentStore();
    const scope = { level: "global" as const };

    const state = { id: "p-comp-1", rules: [], tags: ["important", "report"], description: "doc", schema_snapshot: "" };
    await persistentStore.set("p-comp-1", state, scope);

    const retrieved = await persistentStore.get("p-comp-1", scope);
    expect(retrieved).not.toBeNull();
    expect(retrieved.description).toBe("doc");

    const taggedList = await persistentStore.findByTag("important", scope);
    const taggedIds = taggedList.map((item: any) => item.id || item.filterId || item.objectId || item.formId);
    expect(taggedIds).toContain("p-comp-1");
  });
}

export function runFormStoreComplianceTests(options: ComplianceRunnerOptions) {
  const { test, expect, createSessionStore, createPersistentStore } = options;

  test(`${options.name} - Form Lifecycle & State Serialization`, async () => {
    const sessionStore = await createSessionStore();
    const persistentStore = await createPersistentStore();
    const sessionId = "comp-form-session";

    const schema: any = {
      form_id: "intake",
      start_question: "q1",
      questions: {
        q1: { text: "What is your age?", answer_type: "scale", min_value: 0, max_value: 120, required: true }
      }
    };

    const formStore = new FormStore(sessionStore, persistentStore, new Map([["intake", schema]]));
    const formId = await formStore.init("intake", sessionId);

    const result = await formStore.answer(formId, "q1", 25, sessionId);
    expect(result.complete).toBe(true);

    const state = await sessionStore.get(sessionId, result.form_id);
    expect(state).not.toBeNull();
    expect(state.answers.q1).toBe(25);
  });
}

export function runObjectStoreComplianceTests(options: ComplianceRunnerOptions) {
  const { test, expect, createSessionStore, createPersistentStore } = options;

  test(`${options.name} - Object Compaction & VCS Compression`, async () => {
    const sessionStore = await createSessionStore();
    const persistentStore = await createPersistentStore();
    const sessionId = "comp-object-session";

    const schemas = new Map([
      [
        "profile",
        {
          type: "object",
          properties: { name: { type: "string" }, count: { type: "number" } }
        }
      ]
    ]);

    const objectStore = new ObjectStore(sessionStore, persistentStore, schemas, 7, 5, 2);
    const objId = await objectStore.init("profile", sessionId, "my-profile", { name: "Alice", count: 1 });

    const id2 = await objectStore.set(objId, ["count"], 2, sessionId);
    const id3 = await objectStore.set(id2, ["count"], 3, sessionId);

    const resolvedId = await sessionStore.getAlias(sessionId, "my-profile");
    expect(resolvedId).not.toBeNull();

    const state = await objectStore.getObject(resolvedId!, sessionId);
    expect(state).not.toBeNull();
    expect(state!.data.count).toBe(3);
  });
}

export function runEventStoreComplianceTests(options: ComplianceRunnerOptions) {
  const { test, expect, createSessionStore, createPersistentStore } = options;

  test(`${options.name} - Event Commit Merging & VCS Log`, async () => {
    const sessionStore = await createSessionStore();
    const persistentStore = await createPersistentStore();
    const sessionId = "comp-event-session";

    const schemas = new Map([
      [
        "log_event",
        {
          type: "object",
          properties: { msg: { type: "string" } }
        }
      ]
    ]);

    const eventStore = new EventStore(sessionStore, persistentStore, schemas, 15);
    const commitId1 = await eventStore.init("log_event", sessionId, "main-branch", [
      { msg: "initial" }
    ]);

    await eventStore.append(sessionId, commitId1, { msg: "second" }, "main-branch");

    const resolvedId = await sessionStore.getAlias(sessionId, "main-branch");
    expect(resolvedId).not.toBeNull();

    const commitRecord = await sessionStore.get(sessionId, resolvedId!);
    expect(commitRecord).not.toBeNull();
    expect(commitRecord.mutations[0].type).toBe("add");
  });
}
