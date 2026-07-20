import { test, expect, describe, beforeAll } from "bun:test";
import { ObjectStore } from "../src/middleware/object/store";
import { MemorySessionObjectStore, MemoryPersistentObjectStore } from "../src/adapters/storage/memory-repo";

describe("Unified Object Array Operations", () => {
  let objectStore: ObjectStore;
  const session = "arr-sess";

  beforeAll(() => {
    const objectSchemas = new Map<string, any>([
      [
        "cohort",
        {
          type: "object",
          properties: {
            name: { type: "string" },
            members: {
              type: "array",
              items: { type: "object" }
            }
          }
        }
      ]
    ]);

    objectStore = new ObjectStore(
      new MemorySessionObjectStore(),
      new MemoryPersistentObjectStore(),
      objectSchemas
    );
  });

  test("Insert operations (append & specific index)", async () => {
    const objId = await objectStore.init("cohort", session, undefined, {
      name: "Alpha Team",
      members: []
    });

    // 1. Append (no index)
    const id2 = await objectStore.array_operation(objId, ["members"], "insert", undefined, { name: "Alice" }, session);
    let state = await objectStore.getObject(id2, session);
    expect(state?.data.members).toEqual([{ name: "Alice" }]);

    // 2. Insert at index 0
    const id3 = await objectStore.array_operation(id2, ["members"], "insert", 0, { name: "Bob" }, session);
    state = await objectStore.getObject(id3, session);
    expect(state?.data.members).toEqual([{ name: "Bob" }, { name: "Alice" }]);
  });

  test("Replace operations", async () => {
    const objId = await objectStore.init("cohort", session, undefined, {
      name: "Alpha Team",
      members: [{ name: "Bob" }, { name: "Alice" }]
    });

    // Replace Alice (index 1) with Charlie
    const id2 = await objectStore.array_operation(objId, ["members"], "replace", 1, { name: "Charlie" }, session);
    const state = await objectStore.getObject(id2, session);
    expect(state?.data.members).toEqual([{ name: "Bob" }, { name: "Charlie" }]);
  });

  test("Remove operations", async () => {
    const objId = await objectStore.init("cohort", session, undefined, {
      name: "Alpha Team",
      members: [{ name: "Bob" }, { name: "Charlie" }]
    });

    // Remove Bob (index 0)
    const id2 = await objectStore.array_operation(objId, ["members"], "remove", 0, undefined, session);
    const state = await objectStore.getObject(id2, session);
    expect(state?.data.members).toEqual([{ name: "Charlie" }]);
  });

  test("Error constraints", async () => {
    const objId = await objectStore.init("cohort", session, undefined, {
      name: "Alpha Team",
      members: [{ name: "Bob" }]
    });

    // Target not an array
    expect(
      objectStore.array_operation(objId, ["name"], "insert", undefined, {}, session)
    ).rejects.toThrow("is not an array");

    // Remove missing index
    expect(
      objectStore.array_operation(objId, ["members"], "remove", undefined, undefined, session)
    ).rejects.toThrow("Index is required");

    // Replace index out of bounds
    expect(
      objectStore.array_operation(objId, ["members"], "replace", 99, { name: "X" }, session)
    ).rejects.toThrow("Index out of bounds");
  });
});
