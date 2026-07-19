import { MemorySessionEventStore, MemoryPersistentEventStore } from "../src/adapters/storage/memory-repo";
import { EventStore } from "../src/middleware/event/store";

export async function runEventTests() {
  console.log("\n🚀 Starting Stateful Event Service tests...\n");

  const schemas = new Map<string, any>();
  schemas.set("observation", {
    type: "object",
    required: ["type", "value"],
    properties: {
      type: { type: "string" },
      value: { type: "number" },
      comment: { type: "string" }
    }
  });

  const sessionStore = new MemorySessionEventStore();
  const persistentStore = new MemoryPersistentEventStore();
  const eventStore = new EventStore(sessionStore, persistentStore, schemas, 3);

  const sessionId = "event_test_session_1";

  // ──── TEST CASE 1: Event Schema Validation & Initialization ────
  console.log("🧪 Test Case 1: Event Schema Validation & Initialization");

  // Invalid initial data should throw OBJECT_VALIDATION_FAILED
  try {
    await eventStore.init("observation", sessionId, "init_invalid", [{ type: "HeartRate" } as any]); // missing value
    throw new Error("Expected schema validation to fail for invalid initial data");
  } catch (err: any) {
    if (err.code !== "OBJECT_VALIDATION_FAILED") {
      throw new Error(`Expected OBJECT_VALIDATION_FAILED code, got ${err.code || err.message}`);
    }
  }

  // Valid initial data
  const aliasInit = "baseline";
  const initCommitId = await eventStore.init("observation", sessionId, aliasInit, [
    { type: "HeartRate", value: 72, comment: "Normal baseline" }
  ]);
  if (initCommitId !== aliasInit) {
    throw new Error(`Expected alias ${aliasInit} to be returned, got ${initCommitId}`);
  }

  const initialArray = await eventStore.project(aliasInit, sessionId);
  if (initialArray.length !== 1 || initialArray[0]?.type !== "HeartRate" || initialArray[0]?.value !== 72) {
    throw new Error(`Baseline projection mismatch: ${JSON.stringify(initialArray)}`);
  }
  console.log("✓ Event schema validation and initialization verified successfully.");

  // ──── TEST CASE 2: Mutation Projection (Add, Patch, Delete) ────
  console.log("\n🧪 Test Case 2: Mutation Projection (Add, Patch, Delete)");

  // Append new event
  const tip1 = await eventStore.append(sessionId, "baseline", { type: "Temp", value: 98.6 }, "t1");
  let array = await eventStore.project("t1", sessionId);
  if (array.length !== 2) {
    throw new Error(`Expected 2 events, got: ${array.length}`);
  }
  const tempEvent = array.find((e) => e.type === "Temp");
  if (!tempEvent) throw new Error("Temp event not found in projected array");

  // Patch Temp event
  const tip2 = await eventStore.patch(sessionId, "t1", tempEvent.event_id, { value: 99.1, comment: "Slight fever" }, "t2");
  array = await eventStore.project("t2", sessionId);
  const patchedTemp = array.find((e) => e.event_id === tempEvent.event_id);
  if (!patchedTemp || patchedTemp.value !== 99.1 || patchedTemp.comment !== "Slight fever") {
    throw new Error(`Expected patched Temp event values, got: ${JSON.stringify(patchedTemp)}`);
  }

  // Delete Temp event
  const tip3 = await eventStore.delete(sessionId, "t2", tempEvent.event_id, "t3");
  array = await eventStore.project("t3", sessionId);
  if (array.length !== 1 || array[0]?.type !== "HeartRate") {
    throw new Error(`Expected Temp event to be removed, projected array: ${JSON.stringify(array)}`);
  }
  console.log("✓ Add, patch, and delete projection operations verified successfully.");

  // ──── TEST CASE 3: N-Way Merge Conflict Resolution ────
  console.log("\n🧪 Test Case 3: N-Way Merge Conflict Resolution");

  // Reset store with large threshold to prevent auto-compression during merge test
  const mergeStore = new EventStore(new MemorySessionEventStore(), new MemoryPersistentEventStore(), schemas, 99);
  const sessionMerge = "merge_session_1";

  // Create baseline
  const base = await mergeStore.init("observation", sessionMerge, "main_branch", [
    { type: "HeartRate", value: 72 }
  ]);
  const baselineArray = await mergeStore.project(base, sessionMerge);
  const heartRateEventId = baselineArray[0]?.event_id;
  if (!heartRateEventId) throw new Error("Expected heart rate event ID to exist");

  // Create Stream A (branches from main_branch, updates HeartRate)
  const tipA = await mergeStore.patch(sessionMerge, "main_branch", heartRateEventId, { value: 85 }, "stream_a");

  // Create Stream B (branches from main_branch, also updates HeartRate)
  const tipB = await mergeStore.patch(sessionMerge, "main_branch", heartRateEventId, { value: 90 }, "stream_b");

  // Attempt N-way merge
  const mergeRes = await mergeStore.merge(sessionMerge, ["stream_a", "stream_b"], "main_branch");
  if (mergeRes.status !== "conflict" || !mergeRes.merge_session_id) {
    throw new Error(`Expected merge conflict, got: ${JSON.stringify(mergeRes)}`);
  }

  const sessionInfo = await mergeStore.mergeInspect(mergeRes.merge_session_id);
  if (sessionInfo.conflicts.length !== 1 || sessionInfo.conflicts[0]?.event_id !== heartRateEventId) {
    throw new Error(`Unexpected conflict details: ${JSON.stringify(sessionInfo)}`);
  }

  // Resolve conflict: accept stream_b value (90)
  const resolvedSessionId = await mergeStore.mergeResolve(
    mergeRes.merge_session_id,
    heartRateEventId,
    { strategy: "accept_source", source_id: tipB }
  );

  // Commit merge resolution
  const finalMergedCommit = await mergeStore.mergeCommit(resolvedSessionId, sessionMerge);
  const finalArray = await mergeStore.project(finalMergedCommit, sessionMerge);

  if (finalArray.length !== 1 || finalArray[0]?.value !== 90) {
    throw new Error(`Expected merged heart rate value to be 90, got: ${JSON.stringify(finalArray)}`);
  }
  console.log("✓ N-way conflict detection and stateful resolution verified successfully.");

  // ──── TEST CASE 4: Squash Auto-Compression & GC ────
  console.log("\n🧪 Test Case 4: Squash Auto-Compression & GC");

  const gcStore = new EventStore(new MemorySessionEventStore(), new MemoryPersistentEventStore(), schemas, 3);
  const gcSessionId = "gc_event_session";

  const root = await gcStore.init("observation", gcSessionId, "dev_baseline", [{ type: "HeartRate", value: 72 }]);

  // Linear changes to trigger compression (threshold = 3)
  const step1 = await gcStore.append(gcSessionId, "dev_baseline", { type: "Temp", value: 98.6 }, "dev_alias");
  const step2 = await gcStore.append(gcSessionId, "dev_alias", { type: "O2", value: 98 }, "dev_alias");
  
  // This third mutation exceeds threshold 3 and triggers auto-compression:
  const step3 = await gcStore.append(gcSessionId, "dev_alias", { type: "BP", value: 120 }, "dev_alias");

  // Verify projection at tip is correct
  const projectedGc = await gcStore.project("dev_alias", gcSessionId);
  if (projectedGc.length !== 4) {
    throw new Error(`Expected 4 projected events after auto-compression, got ${projectedGc.length}`);
  }

  // Run GC to prune squashed historical commits
  const gcRes = await gcStore.gc(gcSessionId, [], ["dev_alias"]);
  if (gcRes.deleted_count < 2) {
    throw new Error(`Expected squashed linear commits to be deleted by GC, deleted count: ${gcRes.deleted_count}`);
  }

  console.log("✓ Suffix compression and targeted GC verified successfully.");
}
