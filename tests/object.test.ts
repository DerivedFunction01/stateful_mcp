import { MemorySessionObjectStore, MemoryPersistentObjectStore } from "../src/adapters/storage/memory-repo";
import { ObjectStore } from "../src/middleware/object/store";
import { validateCycleFree } from "../src/middleware/object/schema-walker";

export async function runObjectTests() {
  console.log("\n🧪 Test Case 7: Object Middleware");

  // 1. Validate cycle detection in schema loader
  try {
    const cyclicDefs = {
      NodeA: {
        properties: {
          sibling: { $ref: "#/$defs/NodeB" }
        }
      },
      NodeB: {
        properties: {
          parent: { $ref: "#/$defs/NodeA" }
        }
      }
    };
    validateCycleFree(cyclicDefs);
    throw new Error("Should have thrown error on cyclic schema definition");
  } catch (err: any) {
    if (err.message.includes("Object schema cycle detected")) {
      console.log("✓ validateCycleFree caught recursive schema definition cycle successfully.");
    } else {
      throw err;
    }
  }

  // 2. Setup ObjectStore
  const appointmentSchema = {
    type: "object",
    required: ["title", "start_date"],
    properties: {
      title: { type: "string" },
      start_date: { type: "string" },
      end_date: { type: "string" },
      attendees: {
        type: "array",
        items: {
          type: "object",
          required: ["name"],
          properties: {
            name: { type: "string" },
            role: { type: "string" }
          }
        }
      }
    },
    constraints: [
      {
        op: "lt",
        args: [{ $field: "start_date" }, { $field: "end_date" }],
        error: "start_date must be before end_date"
      }
    ]
  };

  const schemasMap = new Map<string, any>();
  schemasMap.set("appointment", appointmentSchema);

  const objSession = new MemorySessionObjectStore();
  const objPersistent = new MemoryPersistentObjectStore();
  const objectStore = new ObjectStore(objSession, objPersistent, schemasMap);

  // Initialize and write properties
  const objId = await objectStore.init("appointment", "session_abc");
  const objId2 = await objectStore.set(objId, ["title"], "Client Kickoff Meeting", "session_abc");
  const objId3 = await objectStore.set(objId2, ["start_date"], "2026-07-15", "session_abc");

  // Validate structural type check (should reject number on string field)
  try {
    await objectStore.set(objId3, ["title"], 12345, "session_abc");
    throw new Error("Should have rejected number value on string field");
  } catch (err: any) {
    if (err.message.includes("fails schema validation") || err.message.includes("is not of type")) {
      console.log("✓ Type check rejected numeric value on string property successfully.");
    } else {
      throw err;
    }
  }

  // Validate incomplete object (missing start_date; title is set)
  const val1 = await objectStore.validate(objId2, "session_abc");
  if (val1.valid) {
    throw new Error("Validation should say invalid because required fields are missing");
  }
  console.log("✓ Validation detected missing/incomplete fields successfully.");

  // Write end_date to make it valid
  const objId4 = await objectStore.set(objId3, ["end_date"], "2026-07-16", "session_abc");
  const val2 = await objectStore.validate(objId4, "session_abc");
  if (!val2.valid) {
    throw new Error(`Expected validation to pass but failed: ${JSON.stringify(val2)}`);
  }
  console.log("✓ Validation passed when all required fields and constraints are satisfied.");

  // Test constraint violation (start_date >= end_date)
  const objInvalidDates = await objectStore.set(objId4, ["end_date"], "2026-07-14", "session_abc");
  const val3 = await objectStore.validate(objInvalidDates, "session_abc");
  if (val3.valid || val3.invalid.length === 0) {
    throw new Error("Validation should have failed for cross-field constraint start_date < end_date");
  }
  console.log("✓ Cross-field constraint start_date < end_date caught violation successfully: " + (val3.invalid[0]?.reason ?? ""));

  // Test array modifications
  const objId5 = await objectStore.array_append(objId4, ["attendees"], "session_abc");
  const objId6 = await objectStore.set(objId5, ["attendees", 0, "name"], "Alice", "session_abc");
  const resolvedVal = await objectStore.resolve(objId6, "tool_call", "session_abc") as any;
  if (resolvedVal.attendees[0].name !== "Alice") {
    throw new Error("Array append and modify failed");
  }
  console.log("✓ Array modifications and indexing works correctly.");

  // Test lazy references (ref)
  const userProfileSchema = {
    type: "object",
    properties: {
      username: { type: "string" }
    }
  };
  schemasMap.set("profile", userProfileSchema);
  const profileId = await objectStore.init("profile", "session_abc");
  const profileId2 = await objectStore.set(profileId, ["username"], "bob_builder", "session_abc");

  // Link attendee name to username reference
  const objId7 = await objectStore.ref(objId6, ["attendees", 0, "name"], profileId2, ["username"], "session_abc");
  const resolvedWithRef = await objectStore.resolve(objId7, "tool_call", "session_abc") as any;
  if (resolvedWithRef.attendees[0].name !== "bob_builder") {
    throw new Error(`Lazy reference resolution failed. Got: ${resolvedWithRef.attendees[0].name}`);
  }
  console.log("✓ Lazy reference links resolved recursively to target field value: " + resolvedWithRef.attendees[0].name);

  // Test inspect & diff
  const inspectInfo = await objectStore.inspect(objId7, "session_abc");
  if (inspectInfo.objectId !== objId7 || !inspectInfo.validation.valid) {
    throw new Error("Inspect returned wrong metadata");
  }
  console.log("✓ Inspect returned correct object status.");

  const diffResult = await objectStore.diff(objId4, objId6, "session_abc");
  if (!diffResult.added.attendees) {
    throw new Error("Diff failed to show added field");
  }
  console.log("✓ Diff compared version states correctly.");
}
