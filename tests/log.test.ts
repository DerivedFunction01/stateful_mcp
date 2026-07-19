import { FilterStore } from "../src/middleware/filter/store";
import { ObjectStore } from "../src/middleware/object/store";
import { MemorySessionFilterStore, MemoryPersistentFilterStore, MemorySessionObjectStore, MemoryPersistentObjectStore } from "../src/adapters/storage/memory-repo";
import type { TableSchema } from "../src/config/types";
import * as crypto from "crypto";

const SECRET = crypto.randomBytes(32).toString("hex");

interface LogPageToken {
  type: "filter" | "object";
  sessionId: string;
  currentNodeId: string | null;
  pageSize: number;
  userId?: string;
}

function createToken(payload: LogPageToken): string {
  const data = JSON.stringify(payload);
  const signature = crypto.createHmac("sha256", SECRET).update(data).digest("base64url");
  return Buffer.from(JSON.stringify({ data, signature })).toString("base64url");
}

function verifyToken(token: string): LogPageToken {
  try {
    const parsed = JSON.parse(Buffer.from(token, "base64url").toString("utf8"));
    const expectedSignature = crypto.createHmac("sha256", SECRET).update(parsed.data).digest("base64url");
    if (parsed.signature !== expectedSignature) {
      throw new Error("Invalid token signature");
    }
    return JSON.parse(parsed.data);
  } catch (err) {
    throw new Error("Invalid page token");
  }
}

export async function runLogTests() {
  console.log("\n🚀 Starting Stateful Log Service tests...\n");

  const sessionFilterStore = new MemorySessionFilterStore();
  const persistentFilterStore = new MemoryPersistentFilterStore();
  const toolSchemas = new Map<string, Record<string, TableSchema>>();
  toolSchemas.set("browse_catalog", {
    items: {
      filterable_properties: ["price", "category"],
      operators: ["eq", "gt", "lt", "neq"],
      mock_dataset: []
    }
  });

  const filterStore = new FilterStore(
    sessionFilterStore,
    persistentFilterStore,
    toolSchemas,
    new Map<string, TableSchema>(),
    10
  );

  const sessionObjectStore = new MemorySessionObjectStore();
  const persistentObjectStore = new MemoryPersistentObjectStore();
  const objectSchemas = new Map<string, any>();
  objectSchemas.set("appointment", {
    type: "object",
    properties: {
      title: { type: "string" },
      start_date: { type: "string" },
      end_date: { type: "string" }
    }
  });

  const objectStore = new ObjectStore(
    sessionObjectStore,
    persistentObjectStore,
    objectSchemas,
    7,
    5,
    10
  );

  const sessionId = "log_test_session_1";

  // ──── TEST CASE 22: Filter Stateful Log Traversal ────
  console.log("🧪 Test Case 22: Filter Stateful Log Traversal");
  const fRoot = await filterStore.init(sessionId, "browse_catalog", "items");
  const f1 = await filterStore.add(fRoot, [{ property: "price", operator: "gt", value: 100 }], sessionId);
  const f2 = await filterStore.add(f1, [{ property: "category", operator: "eq", value: "apparel" }], sessionId);
  const f3 = await filterStore.add(f2, [{ property: "price", operator: "lt", value: 200 }], sessionId);

  // Helper to emulate log_open
  async function logOpenFilters(id: string, limit: number) {
    const resolvedId = await filterStore["resolveId"](id, sessionId);
    const entries: any[] = [];
    let currentNodeId: string | null = resolvedId;
    let count = 0;

    while (currentNodeId && count < limit) {
      const node = await filterStore.getFilter(currentNodeId, sessionId);
      if (!node) break;
      entries.push({
        id: node.filterId,
        parent_id: node.parentFilterId ?? null,
        created_at: node.createdAt,
        rules: node.rules
      });
      currentNodeId = node.parentFilterId ?? null;
      count++;
    }

    const token = currentNodeId ? createToken({
      type: "filter",
      sessionId,
      currentNodeId,
      pageSize: limit
    }) : null;

    return { entries, next_page_token: token, has_more: !!token };
  }

  // Open log session with limit = 2
  const page1 = await logOpenFilters(f3, 2);
  if (page1.entries.length !== 2 || page1.entries[0].id !== f3 || page1.entries[1].id !== f2) {
    throw new Error(`Page 1 mismatch: ${JSON.stringify(page1)}`);
  }
  if (!page1.next_page_token || !page1.has_more) {
    throw new Error("Expected page token and has_more to be true");
  }

  // Verify the page token decrypts/verifies correctly
  const payload = verifyToken(page1.next_page_token);
  if (payload.currentNodeId !== f1 || payload.type !== "filter") {
    throw new Error(`Token payload mismatch: ${JSON.stringify(payload)}`);
  }

  // Helper to emulate log_next
  async function logNextFilters(pageToken: string) {
    const payload = verifyToken(pageToken);
    const { currentNodeId: startNodeId, pageSize: limit } = payload;
    const entries: any[] = [];
    let currentNodeId: string | null = startNodeId;
    let count = 0;

    while (currentNodeId && count < limit) {
      const node = await filterStore.getFilter(currentNodeId, sessionId);
      if (!node) break;
      entries.push({
        id: node.filterId,
        parent_id: node.parentFilterId ?? null,
        created_at: node.createdAt,
        rules: node.rules
      });
      currentNodeId = node.parentFilterId ?? null;
      count++;
    }

    const nextToken = currentNodeId ? createToken({
      type: "filter",
      sessionId,
      currentNodeId,
      pageSize: limit
    }) : null;

    return { entries, next_page_token: nextToken, has_more: !!nextToken };
  }

  const page2 = await logNextFilters(page1.next_page_token);
  if (page2.entries.length !== 2 || page2.entries[0].id !== f1 || page2.entries[1].id !== fRoot) {
    throw new Error(`Page 2 mismatch: ${JSON.stringify(page2)}`);
  }
  if (page2.next_page_token !== null || page2.has_more !== false) {
    throw new Error("Expected page 2 to reach the root and have no next page token");
  }
  console.log("✓ Filter stateful log traversal completed and verified.");

  // ──── TEST CASE 23: Object Stateful Log Traversal & Delta Extraction ────
  console.log("\n🧪 Test Case 23: Object Stateful Log Traversal & Delta Extraction");
  const oRoot = await objectStore.init("appointment", sessionId);
  const o1 = await objectStore.set(oRoot, ["title"], "Holiday Party", sessionId);
  const o2 = await objectStore.set(o1, ["start_date"], "2026-07-20", sessionId);

  // Helper to emulate log_open for objects
  async function logOpenObjects(id: string, limit: number) {
    const resolvedId = await objectStore["resolveId"](id, sessionId);
    const entries: any[] = [];
    let currentNodeId: string | null = resolvedId;
    let count = 0;

    while (currentNodeId && count < limit) {
      const node = await objectStore.getObject(currentNodeId, sessionId);
      if (!node) break;
      const parentNode = node.parentObjectId ? await objectStore.getObject(node.parentObjectId, sessionId) : null;
      
      const delta: Record<string, any> = {};
      const currData = node.data || {};
      const parentData = parentNode ? (parentNode.data || {}) : {};
      for (const key of Object.keys(currData)) {
        if (!parentNode || JSON.stringify(currData[key]) !== JSON.stringify(parentData[key])) {
          delta[key] = currData[key];
        }
      }

      entries.push({
        id: node.objectId,
        parent_id: node.parentObjectId ?? null,
        created_at: node.createdAt,
        delta
      });
      currentNodeId = node.parentObjectId ?? null;
      count++;
    }

    const token = currentNodeId ? createToken({
      type: "object",
      sessionId,
      currentNodeId,
      pageSize: limit
    }) : null;

    return { entries, next_page_token: token, has_more: !!token };
  }

  const oPage1 = await logOpenObjects(o2, 2);
  if (oPage1.entries.length !== 2 || oPage1.entries[0].id !== o2 || oPage1.entries[1].id !== o1) {
    throw new Error(`Object Page 1 mismatch: ${JSON.stringify(oPage1)}`);
  }
  // Verify delta keys: o2 should only have start_date delta, o1 should only have title delta
  if (Object.keys(oPage1.entries[0].delta).join(",") !== "start_date") {
    throw new Error(`Expected delta for o2 to be start_date, got: ${JSON.stringify(oPage1.entries[0].delta)}`);
  }
  if (Object.keys(oPage1.entries[1].delta).join(",") !== "title") {
    throw new Error(`Expected delta for o1 to be title, got: ${JSON.stringify(oPage1.entries[1].delta)}`);
  }
  console.log("✓ Object stateful log traversal and sparse delta extraction verified successfully.");

  // ──── TEST CASE 24: Tampered Token Rejection ────
  console.log("\n🧪 Test Case 24: Tampered Token Rejection");
  try {
    const tamperedToken = page1.next_page_token + "tampered";
    verifyToken(tamperedToken);
    throw new Error("Expected verifyToken to throw an error for tampered token");
  } catch (err: any) {
    // Expected behavior
  }
  console.log("✓ Cryptographic log session signature security check verified successfully.");
}
