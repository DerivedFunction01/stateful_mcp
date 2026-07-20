import { test, expect, describe, beforeAll, afterAll } from "bun:test";
import { runStoreComplianceTests } from "../src/adapters/storage/compliance";

import {
  MemorySessionFilterStore,
  MemoryPersistentFilterStore
} from "../src/adapters/storage/memory-repo";

import {
  JsonlSessionFilterStore,
  JsonlPersistentFilterStore
} from "../src/adapters/storage/jsonl-repo";

import {
  SqliteFilterStore
} from "../src/adapters/storage/sqlite-repo";

import {
  LocalStorageSessionStore,
  LocalStoragePersistentStore,
  IndexedDbSessionStore,
  IndexedDbPersistentStore
} from "../src/adapters/storage/browser-repo";

import * as fs from "fs";
import * as path from "path";

// Mock global browser variables for browser store tests
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
              },
              getAllKeys() {
                const req: any = {};
                setTimeout(() => {
                  req.result = Array.from(storeMap.keys());
                  if (req.onsuccess) req.onsuccess();
                }, 0);
                return req;
              },
              getAll() {
                const req: any = {};
                setTimeout(() => {
                  req.result = Array.from(storeMap.values());
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
  }
};

describe("Storage Compliance Test Runner", () => {
  beforeAll(() => {
    (globalThis as any).window = {
      localStorage: mockLocalStorage,
      indexedDB: mockIndexedDB
    };
  });

  // 1. Memory Repo Compliance
  describe("Memory Store", () => {
    runStoreComplianceTests({
      name: "Memory Store",
      test,
      expect,
      createSessionStore: async () => new MemorySessionFilterStore(),
      createPersistentStore: async () => new MemoryPersistentFilterStore()
    });
  });

  // 2. JSONL Repo Compliance
  describe("JSONL Store", () => {
    const tmpDir = path.resolve(__dirname, "../scratch/compliance-jsonl");
    if (!fs.existsSync(tmpDir)) {
      fs.mkdirSync(tmpDir, { recursive: true });
    }
    const sessPath = path.join(tmpDir, "session.jsonl");
    const globPath = path.join(tmpDir, "global.jsonl");

    afterAll(() => {
      try {
        if (fs.existsSync(sessPath)) fs.unlinkSync(sessPath);
        if (fs.existsSync(globPath)) fs.unlinkSync(globPath);
        if (fs.existsSync(tmpDir)) fs.rmdirSync(tmpDir);
      } catch (_) {}
    });

    runStoreComplianceTests({
      name: "JSONL Store",
      test,
      expect,
      createSessionStore: async () => {
        if (fs.existsSync(sessPath)) fs.unlinkSync(sessPath);
        return new JsonlSessionFilterStore(sessPath);
      },
      createPersistentStore: async () => {
        if (fs.existsSync(globPath)) fs.unlinkSync(globPath);
        return new JsonlPersistentFilterStore(globPath);
      }
    });
  });

  // 3. SQLite Repo Compliance
  describe("SQLite Store", () => {
    const tmpDir = path.resolve(__dirname, "../scratch/compliance-sqlite");
    if (!fs.existsSync(tmpDir)) {
      fs.mkdirSync(tmpDir, { recursive: true });
    }
    const dbPath = path.join(tmpDir, "test.db");

    afterAll(() => {
      try {
        if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
        if (fs.existsSync(tmpDir)) fs.rmdirSync(tmpDir);
      } catch (_) {}
    });

    runStoreComplianceTests({
      name: "SQLite Store",
      test,
      expect,
      createSessionStore: async () => {
        if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
        return new SqliteFilterStore(dbPath);
      },
      createPersistentStore: async () => {
        return new SqliteFilterStore(dbPath);
      }
    });
  });

  // 4. LocalStorage Repo Compliance
  describe("LocalStorage Store", () => {
    runStoreComplianceTests({
      name: "LocalStorage Store",
      test,
      expect,
      createSessionStore: async () => {
        mockLocalStorage.store.clear();
        return new LocalStorageSessionStore();
      },
      createPersistentStore: async () => {
        mockLocalStorage.store.clear();
        return new LocalStoragePersistentStore();
      }
    });
  });

  // 5. IndexedDB Repo Compliance
  describe("IndexedDB Store", () => {
    runStoreComplianceTests({
      name: "IndexedDB Store",
      test,
      expect,
      createSessionStore: async () => {
        mockIndexedDBStore.get("states")!.clear();
        mockIndexedDBStore.get("aliases")!.clear();
        return new IndexedDbSessionStore("test-compliance-db");
      },
      createPersistentStore: async () => {
        mockIndexedDBStore.get("states")!.clear();
        return new IndexedDbPersistentStore("test-compliance-db");
      }
    });
  });
});
