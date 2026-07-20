import { test, expect, describe, beforeAll } from "bun:test";
import {
  LocalStorageSessionStore,
  LocalStoragePersistentStore,
  IndexedDbSessionStore,
  IndexedDbPersistentStore
} from "../src/adapters/storage/browser-repo";

// Mock global window and storage
const mockLocalStorage: any = {
  store: new Map<string, string>(),
  getItem(key: string) {
    return this.store.get(key) || null;
  },
  setItem(key: string, value: string) {
    this.store.set(key, value);
  },
  removeItem(key: string) {
    this.store.delete(key);
  },
  key(index: number) {
    return Array.from(this.store.keys())[index] || null;
  },
  get length() {
    return this.store.size;
  }
};

const mockIndexedDBStore = new Map<string, Map<string, any>>();
mockIndexedDBStore.set("states", new Map());
mockIndexedDBStore.set("aliases", new Map());

const mockIndexedDB: any = {
  open(dbName: string) {
    const request: any = {
      result: {
        objectStoreNames: {
          contains(name: string) {
            return mockIndexedDBStore.has(name);
          }
        },
        createObjectStore(name: string) {
          mockIndexedDBStore.set(name, new Map());
        }
      }
    };
    setTimeout(() => {
      if (request.onsuccess) request.onsuccess();
    }, 0);
    return request;
  }
};

describe("Browser Storage Adapters", () => {
  beforeAll(() => {
    (globalThis as any).window = {
      localStorage: mockLocalStorage,
      indexedDB: mockIndexedDB
    };
  });

  describe("LocalStorage Adapters", () => {
    const sessionStore = new LocalStorageSessionStore();
    const persistentStore = new LocalStoragePersistentStore();
    const sessionId = "sess-local";

    test("Create and read session state", async () => {
      const state = { objectId: "", value: "hello" };
      const id = await sessionStore.create(sessionId, state, "my-alias");
      expect(id).toBeDefined();

      const retrieved = await sessionStore.get(sessionId, id);
      expect(retrieved.value).toBe("hello");

      const resolvedId = await sessionStore.getAlias(sessionId, "my-alias");
      expect(resolvedId).toBe(id);
    });

    test("Create and read persistent state", async () => {
      const state = { id: "global-state", val: 42 };
      await persistentStore.set("global-state", state, { level: "global" });

      const retrieved = await persistentStore.get("global-state", { level: "global" });
      expect(retrieved.val).toBe(42);
    });
  });

  describe("IndexedDB Adapters", () => {
    const sessionStore = new IndexedDbSessionStore("test-db");
    const persistentStore = new IndexedDbPersistentStore("test-db");
    const sessionId = "sess-idb";

    // Set up mock window.indexedDB transaction behavior
    beforeAll(() => {
      (globalThis as any).window.indexedDB.open = (dbName: string) => {
        const dbResult = {
          objectStoreNames: {
            contains(name: string) {
              return true;
            }
          },
          transaction(storeName: string, mode: string) {
            const storeMap = mockIndexedDBStore.get(storeName)!;
            return {
              objectStore() {
                return {
                  get(key: string) {
                    const req: any = {};
                    setTimeout(() => {
                      req.result = storeMap.get(key);
                      if (req.onsuccess) req.onsuccess();
                    }, 0);
                    return req;
                  },
                  put(value: any, key: string) {
                    const req: any = {};
                    setTimeout(() => {
                      storeMap.set(key, value);
                      if (req.onsuccess) req.onsuccess();
                    }, 0);
                    return req;
                  },
                  delete(key: string) {
                    const req: any = {};
                    setTimeout(() => {
                      storeMap.delete(key);
                      if (req.onsuccess) req.onsuccess();
                    }, 0);
                    return req;
                  }
                };
              }
            };
          }
        };
        const request: any = {
          result: dbResult
        };
        setTimeout(() => {
          if (request.onsuccess) request.onsuccess();
        }, 0);
        return request;
      };
    });

    test("Create and read session state", async () => {
      const state = { objectId: "", value: "idb-hello" };
      const id = await sessionStore.create(sessionId, state, "idb-alias");
      expect(id).toBeDefined();

      const retrieved = await sessionStore.get(sessionId, id);
      expect(retrieved.value).toBe("idb-hello");

      const resolvedId = await sessionStore.getAlias(sessionId, "idb-alias");
      expect(resolvedId).toBe(id);
    });

    test("Create and read persistent state", async () => {
      const state = { id: "p-state", val: 100 };
      await persistentStore.set("p-state", state, { level: "global" });

      const retrieved = await persistentStore.get("p-state", { level: "global" });
      expect(retrieved.val).toBe(100);
    });
  });
});
