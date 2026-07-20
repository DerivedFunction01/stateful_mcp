// REFERENCE: docs/browser.md

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
