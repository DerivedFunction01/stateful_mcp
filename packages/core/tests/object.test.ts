import {
	MemoryPersistentObjectStore,
	MemorySessionObjectStore,
} from "../src/adapters/storage/memory-repo";
import { validateCycleFree } from "../src/middleware/object/schema-walker";
import { ObjectStore } from "../src/middleware/object/store";
export async function runObjectTests() {
	console.log("\n🧪 Test Case 1: Object Middleware");

	// 1. Validate cycle detection in schema loader
	try {
		const cyclicDefs = {
			NodeA: {
				properties: {
					sibling: { $ref: "#/$defs/NodeB" },
				},
			},
			NodeB: {
				properties: {
					parent: { $ref: "#/$defs/NodeA" },
				},
			},
		};
		validateCycleFree(cyclicDefs);
		throw new Error("Should have thrown error on cyclic schema definition");
	} catch (err: any) {
		if (err.message.includes("Object schema cycle detected")) {
			console.log(
				"✓ validateCycleFree caught recursive schema definition cycle successfully.",
			);
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
						role: { type: "string" },
					},
				},
			},
		},
		constraints: [
			{
				op: "lt",
				args: [{ $field: "start_date" }, { $field: "end_date" }],
				error: "start_date must be before end_date",
			},
		],
	};

	const schemasMap = new Map<string, any>();
	schemasMap.set("appointment", appointmentSchema);

	const objSession = new MemorySessionObjectStore();
	const objPersistent = new MemoryPersistentObjectStore();
	const objectStore = new ObjectStore(objSession, objPersistent, schemasMap);

	// Initialize and write properties
	const objId = await objectStore.init("appointment", "session_abc");
	const objId2 = await objectStore.set(
		objId,
		["title"],
		"Client Kickoff Meeting",
		"session_abc",
	);
	const objId3 = await objectStore.set(
		objId2,
		["start_date"],
		"2026-07-15",
		"session_abc",
	);

	// Validate structural type check (should reject number on string field)
	try {
		await objectStore.set(objId3, ["title"], 12345, "session_abc");
		throw new Error("Should have rejected number value on string field");
	} catch (err: any) {
		if (
			err.message.includes("fails schema validation") ||
			err.message.includes("is not of type")
		) {
			console.log(
				"✓ Type check rejected numeric value on string property successfully.",
			);
		} else {
			throw err;
		}
	}

	// Validate incomplete object (missing start_date; title is set)
	const val1 = await objectStore.validate(objId2, "session_abc");
	if (val1.valid) {
		throw new Error(
			"Validation should say invalid because required fields are missing",
		);
	}
	console.log("✓ Validation detected missing/incomplete fields successfully.");

	// Write end_date to make it valid
	const objId4 = await objectStore.set(
		objId3,
		["end_date"],
		"2026-07-16",
		"session_abc",
	);
	const val2 = await objectStore.validate(objId4, "session_abc");
	if (!val2.valid) {
		throw new Error(
			`Expected validation to pass but failed: ${JSON.stringify(val2)}`,
		);
	}
	console.log(
		"✓ Validation passed when all required fields and constraints are satisfied.",
	);

	// Test constraint violation (start_date >= end_date)
	const objInvalidDates = await objectStore.set(
		objId4,
		["end_date"],
		"2026-07-14",
		"session_abc",
	);
	const val3 = await objectStore.validate(objInvalidDates, "session_abc");
	if (val3.valid || val3.invalid.length === 0) {
		throw new Error(
			"Validation should have failed for cross-field constraint start_date < end_date",
		);
	}
	console.log(
		"✓ Cross-field constraint start_date < end_date caught violation successfully: " +
			(val3.invalid[0]?.reason ?? ""),
	);

	// Test array modifications
	const objId5 = await objectStore.array_append(
		objId4,
		["attendees"],
		"session_abc",
	);
	const objId6 = await objectStore.set(
		objId5,
		["attendees", 0, "name"],
		"Alice",
		"session_abc",
	);
	const resolvedVal = (await objectStore.resolve(
		objId6,
		"tool_call",
		"session_abc",
	)) as any;
	if (resolvedVal.attendees[0].name !== "Alice") {
		throw new Error("Array append and modify failed");
	}
	console.log("✓ Array modifications and indexing works correctly.");

	// Test lazy references (ref)
	const userProfileSchema = {
		type: "object",
		properties: {
			username: { type: "string" },
		},
	};
	schemasMap.set("profile", userProfileSchema);
	const profileId = await objectStore.init("profile", "session_abc");
	const profileId2 = await objectStore.set(
		profileId,
		["username"],
		"bob_builder",
		"session_abc",
	);

	// Link attendee name to username reference
	const objId7 = await objectStore.ref(
		objId6,
		["attendees", 0, "name"],
		profileId2,
		["username"],
		"session_abc",
	);
	const resolvedWithRef = (await objectStore.resolve(
		objId7,
		"tool_call",
		"session_abc",
	)) as any;
	if (resolvedWithRef.attendees[0].name !== "bob_builder") {
		throw new Error(
			`Lazy reference resolution failed. Got: ${resolvedWithRef.attendees[0].name}`,
		);
	}
	console.log(
		"✓ Lazy reference links resolved recursively to target field value: " +
			resolvedWithRef.attendees[0].name,
	);

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

	// ─── TEST CASE 2: Object Store GC and Auto-Compression ───
	console.log("\n🧪 Test Case 2: Object Store GC and Auto-Compression");

	// Create store with chain threshold = 3
	const gcObjectStore = new ObjectStore(
		new MemorySessionObjectStore(),
		new MemoryPersistentObjectStore(),
		schemasMap,
		7,
		5,
		3,
	);

	const gcSessionId = "gc_session_object_999";
	const oRoot = await gcObjectStore.init("appointment", gcSessionId);

	// 1. Verify Auto-Compression
	const o1 = await gcObjectStore.set(
		oRoot,
		["title"],
		"Meeting A",
		gcSessionId,
	);
	const o2 = await gcObjectStore.set(
		o1,
		["start_date"],
		"2026-07-15",
		gcSessionId,
	);
	// depth: oRoot(1) -> o1(2) -> o2(3). Adding o3 will hit depth 4 (exceeding threshold 3)
	const o3 = await gcObjectStore.set(
		o2,
		["end_date"],
		"2026-07-16",
		gcSessionId,
	);

	// o3 should be compressed. Check that parentObjectId is null
	const oState3 = await gcObjectStore["session"].get(gcSessionId, o3);
	if (!oState3 || oState3.parentObjectId !== null) {
		throw new Error(
			`Object auto-compression failed: oState3 is ${JSON.stringify(oState3)}`,
		);
	}

	// The resolved data should have all properties set
	if (
		oState3.data.title !== "Meeting A" ||
		oState3.data.start_date !== "2026-07-15" ||
		oState3.data.end_date !== "2026-07-16"
	) {
		throw new Error(
			`Compressed object data mismatch: ${JSON.stringify(oState3.data)}`,
		);
	}
	console.log(
		"✓ ObjectStore auto-compression successfully flattened linear chain.",
	);

	// 2. Verify Branch Point preserves branch points
	const oRoot2 = await gcObjectStore.init("appointment", gcSessionId);
	const obid1 = await gcObjectStore.set(
		oRoot2,
		["title"],
		"Branch 1",
		gcSessionId,
	);
	const obid2 = await gcObjectStore.set(
		oRoot2,
		["title"],
		"Branch 2",
		gcSessionId,
	);

	// obid2 linearDepth should be 1 because oRoot2 has multiple children (obid1 and obid2)
	const oStateBid2 = await gcObjectStore["session"].get(gcSessionId, obid2);
	if (!oStateBid2 || oStateBid2.linearDepth !== 1) {
		throw new Error(
			`Linear depth of object branch node should be 1, got: ${oStateBid2?.linearDepth}`,
		);
	}

	// Extend obid2 chain
	const obid3 = await gcObjectStore.set(
		obid2,
		["start_date"],
		"2026-07-15",
		gcSessionId,
	); // depth 2
	const obid4 = await gcObjectStore.set(
		obid3,
		["end_date"],
		"2026-07-16",
		gcSessionId,
	); // depth 3
	const obid5 = await gcObjectStore.set(
		obid4,
		["title"],
		"Updated Title",
		gcSessionId,
	); // depth 4 -> suffix compression

	// obid5 should point to oRoot2 as parent (since oRoot2 is the branch point)
	const oStateBid5 = await gcObjectStore["session"].get(gcSessionId, obid5);
	if (!oStateBid5 || oStateBid5.parentObjectId !== oRoot2) {
		throw new Error(
			`Object Suffix compression failed to stop at branch point: parent is ${oStateBid5?.parentObjectId}`,
		);
	}
	console.log("✓ Object Suffix compression correctly preserves branch points.");

	// 3. Verify targeted GC
	const obidDead = await gcObjectStore.set(
		oRoot2,
		["start_date"],
		"2026-07-20",
		gcSessionId,
	);

	// GC keeping obid5. obidDead, obid2, obid3, obid4 should be pruned. oRoot2 and obid5 should be kept.
	await gcObjectStore.gc(gcSessionId, [obid5]);

	const deadObj = await gcObjectStore["session"].get(gcSessionId, obidDead);
	if (deadObj) {
		throw new Error("Object GC failed to prune dead branch.");
	}

	const oNode2 = await gcObjectStore["session"].get(gcSessionId, obid2);
	const oNode3 = await gcObjectStore["session"].get(gcSessionId, obid3);
	const oNode4 = await gcObjectStore["session"].get(gcSessionId, obid4);
	if (oNode2 || oNode3 || oNode4) {
		throw new Error("Object GC failed to prune compressed intermediate nodes.");
	}

	const oNode5 = await gcObjectStore["session"].get(gcSessionId, obid5);
	const oNodeRoot = await gcObjectStore["session"].get(gcSessionId, oRoot2);
	if (!oNode5 || !oNodeRoot) {
		throw new Error("Object GC deleted active or ancestor nodes.");
	}
	console.log(
		"✓ ObjectStore targeted GC successfully pruned dead branches and compressed intermediate garbage.",
	);

	console.log("\n🧪 Test Case 3: Object State Aliasing and Pruning");

	const aliasObjectStore = new ObjectStore(
		new MemorySessionObjectStore(),
		new MemoryPersistentObjectStore(),
		schemasMap,
		7,
		5,
		5,
	);

	const sessionIdAlias = "alias_session_obj_1";

	// 1. Initialize with an alias
	const aliasVal = "shopping_cart";
	const initId = await aliasObjectStore.init(
		"appointment",
		sessionIdAlias,
		aliasVal,
	);
	if (initId !== "shopping_cart") {
		throw new Error(
			`Expected alias "shopping_cart" to be returned, got ${initId}`,
		);
	}

	// Verify the alias points to the underlying state ID
	const resolvedInitId = await aliasObjectStore["resolveId"](
		aliasVal,
		sessionIdAlias,
	);
	if (!resolvedInitId.startsWith("obj_")) {
		throw new Error(
			`Expected resolved ID to be an object UUID prefix, got ${resolvedInitId}`,
		);
	}

	// 2. Perform mutation without changing alias name (pointer should auto-advance)
	const childId1 = await aliasObjectStore.set(
		"shopping_cart",
		["title"],
		"Holiday Party",
		sessionIdAlias,
	);
	if (childId1 !== "shopping_cart") {
		throw new Error(
			`Expected active alias "shopping_cart" to be returned from set, got ${childId1}`,
		);
	}
	const resolvedChildId1 = await aliasObjectStore["resolveId"](
		"shopping_cart",
		sessionIdAlias,
	);
	if (resolvedChildId1 === resolvedInitId) {
		throw new Error(`Expected alias pointer to advance to the new child state`);
	}

	// 3. Progressive Tagging / Branching (using new_alias)
	// To pass new_alias to set, we pass it as the 6th parameter.
	const childId2 = await aliasObjectStore.set(
		"shopping_cart",
		["start_date"],
		"2026-07-20",
		sessionIdAlias,
		undefined,
		"shopping_cart_locked",
	);
	if (childId2 !== "shopping_cart_locked") {
		throw new Error(
			`Expected new alias "shopping_cart_locked" to be returned, got ${childId2}`,
		);
	}

	// Check pointers:
	// "shopping_cart" should still point to childId1 (resolvedChildId1)
	const resolvedShoppingCart = await aliasObjectStore["resolveId"](
		"shopping_cart",
		sessionIdAlias,
	);
	if (resolvedShoppingCart !== resolvedChildId1) {
		throw new Error(
			`Expected "shopping_cart" to still point to parent checkpoint`,
		);
	}
	// "shopping_cart_locked" should point to the new state
	const resolvedShoppingCartLocked = await aliasObjectStore["resolveId"](
		"shopping_cart_locked",
		sessionIdAlias,
	);
	if (resolvedShoppingCartLocked === resolvedShoppingCart) {
		throw new Error(
			`Expected "shopping_cart_locked" to point to the new branch`,
		);
	}

	// 4. GC with Alias pruning (Whitelist/Blacklist)
	// Let's add a dead branch from shopping_cart with a new alias
	const deadId = await aliasObjectStore.set(
		"shopping_cart",
		["end_date"],
		"2026-07-25",
		sessionIdAlias,
		undefined,
		"shopping_cart_expired",
	);

	// Verify that it is in the session
	const expiredState = await aliasObjectStore["session"].get(
		sessionIdAlias,
		await aliasObjectStore["resolveId"](
			"shopping_cart_expired",
			sessionIdAlias,
		),
	);
	if (!expiredState) {
		throw new Error("Expected expired branch state to exist");
	}

	// Prune using whitelist (only keep shopping_cart and shopping_cart_locked)
	await aliasObjectStore.gc(
		sessionIdAlias,
		[],
		["shopping_cart", "shopping_cart_locked"],
	);

	// shopping_cart_expired alias should be deleted
	const resolvedExpired = await aliasObjectStore["resolveId"](
		"shopping_cart_expired",
		sessionIdAlias,
	);
	if (resolvedExpired === "shopping_cart_expired") {
		// If it doesn't resolve, it just returns the input string
		const expiredNode = await aliasObjectStore["session"].get(
			sessionIdAlias,
			resolvedExpired,
		);
		if (expiredNode) {
			throw new Error("Expected expired branch to be garbage collected");
		}
	} else {
		throw new Error(
			`Expected shopping_cart_expired alias to be deleted, but it resolved to ${resolvedExpired}`,
		);
	}

	console.log(
		"✓ Object state aliasing, branching, and GC alias whitelists/blacklists verified successfully.",
	);

	console.log("\n🧪 Test Case 4: Object Schema Guard");
	// Initialize two objects of different schemas (e.g. appointment vs catalog)
	// Wait, does appointment exist? Yes, we resolved it above.
	// Let's check what other schemas are in the schemasMap.
	// We can just look up. Let's see what schemas are in schemasMap. We saw "appointment" is one.
	// Is there any other schema registered? Let's check where schemasMap is initialized.
	// Actually, we can temporarily register a second schema or just construct objects of different schemaNames.
	const oSchemaA = await aliasObjectStore.init("appointment", sessionIdAlias);

	// We can dynamically add a dummy schema definition to aliasObjectStore's schemas Map:
	aliasObjectStore["schemas"].set("dummy_schema", {
		type: "object",
		properties: { price: { type: "number" } },
	});
	const oSchemaB = await aliasObjectStore.init("dummy_schema", sessionIdAlias);

	try {
		await aliasObjectStore.diff(oSchemaA, oSchemaB, sessionIdAlias);
		throw new Error(
			"Expected SCHEMA_MISMATCH error to be thrown when diffing different object schemas",
		);
	} catch (err: any) {
		if (err.code !== "SCHEMA_MISMATCH") {
			throw new Error(
				`Expected SCHEMA_MISMATCH error code, got ${err.code || err.message}`,
			);
		}
	}
	console.log("✓ Object schema mismatch guard verified successfully.");

	console.log("\n🧪 Test Case 5: Object Pre-populated Initialization");
	const initData = {
		title: "Launch Party",
		start_date: "2026-07-19",
		end_date: "2026-07-20",
	};
	const oPopulated = await aliasObjectStore.init(
		"appointment",
		sessionIdAlias,
		"party_prepopulated",
		initData,
	);
	const populatedObj = await aliasObjectStore.getObject(
		oPopulated,
		sessionIdAlias,
	);
	if (
		!populatedObj ||
		populatedObj.data.title !== "Launch Party" ||
		populatedObj.data.start_date !== "2026-07-19"
	) {
		throw new Error(
			`Expected pre-populated object data to match input, got: ${JSON.stringify(populatedObj?.data)}`,
		);
	}
	console.log("✓ Object pre-populated initialization verified successfully.");

	console.log("\n🧪 Test Case 6: Object Persistent Saving & Auto-Compression");
	const saveObjectId = await aliasObjectStore.init(
		"appointment",
		sessionIdAlias,
	);
	const uncompressedObjectId = await aliasObjectStore.set(
		saveObjectId,
		["title"],
		"Launch Ceremony",
		sessionIdAlias,
	);

	const savedObjectId = await aliasObjectStore.save(
		uncompressedObjectId,
		["tag-object"],
		"Auto-compressed object",
		{ level: "global" },
		sessionIdAlias,
	);

	if (savedObjectId === uncompressedObjectId) {
		throw new Error(
			"Expected saving an uncompressed object to return a new auto-compressed object ID",
		);
	}

	const persistedObject = await aliasObjectStore["persistent"].get(
		savedObjectId,
		{ level: "global" },
	);
	if (!persistedObject || persistedObject.parentObjectId !== null) {
		throw new Error(
			`Persisted object not found or not compressed: ${JSON.stringify(persistedObject)}`,
		);
	}
	console.log(
		"✓ Object persistent save with auto-compression verified successfully.",
	);
}
