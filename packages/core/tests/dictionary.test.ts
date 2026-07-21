import { InMemoryConceptResolver } from "../src/middleware/dictionary/resolver";
import { DictionaryStore } from "../src/middleware/dictionary/store";

export async function runDictionaryTests() {
	console.log("\n🧪 Test Case 1: Dictionary Service");

	const resolver = new InMemoryConceptResolver();
	const dictStore = new DictionaryStore(resolver);

	// Load sample dictionary config
	await dictStore.loadConfig({
		namespaces: [{ code: "SNOMED", isPublic: true, isExternalPrivate: false }],
		concepts: [
			{
				id: "c_mi",
				namespaceCode: "SNOMED",
				standardCode: "I21.9",
				display: "Myocardial Infarction",
				description: "A blockage of blood flow to the heart muscle.",
			},
		],
		expressions: [
			{
				id: "expr_1",
				term: "heart attack",
				regexPattern: "\\bheart\\s+attack\\b",
				isCaseInsensitive: true,
				targetAssignment: "MAIN_TERM",
				conceptId: "c_mi",
				priorityWeight: 5,
				active: true,
			},
		],
		allowedTargetAssignments: ["MAIN_TERM", "METRIC"],
		defaultDynamicNamespace: "LOCAL_CLINIC",
		workspaces: [{ id: "dept_cardiology", name: "Cardiology" }],
		allowedTags: ["clinical", "cardiology"],
		exposeTagsAsEnum: true,
	});

	// Verify defaultDynamicNamespace
	if (dictStore.getDefaultDynamicNamespace() !== "LOCAL_CLINIC") {
		throw new Error(
			"getDefaultDynamicNamespace failed to load correct config value",
		);
	}

	// Verify Concept description is loaded
	const concept = await dictStore.getConcept("c_mi");
	if (
		!concept ||
		concept.description !== "A blockage of blood flow to the heart muscle."
	) {
		throw new Error("Concept description was not loaded correctly");
	}
	console.log("✓ Dictionary successfully loaded concept description.");

	// Verify allowedTargetAssignments validation
	try {
		await dictStore.addExpression({
			term: "unsupported assignment test",
			regexPattern: "test",
			isCaseInsensitive: true,
			targetAssignment: "UNSUPPORTED",
			conceptId: "c_mi",
			priorityWeight: 1,
			active: true,
		});
		throw new Error(
			"Should have thrown error on unsupported target assignment",
		);
	} catch (err: any) {
		if (!err.message.includes("is not in the allowed list of assignments")) {
			throw err;
		}
	}
	console.log(
		"✓ Dictionary successfully validated targetAssignment against allowed list.",
	);

	// Verify workspace validation
	try {
		await dictStore.addExpression({
			term: "unsupported workspace test",
			regexPattern: "test",
			isCaseInsensitive: true,
			targetAssignment: "MAIN_TERM",
			conceptId: "c_mi",
			priorityWeight: 1,
			active: true,
			context: {
				workspace_id: "dept_pediatrics",
			},
		});
		throw new Error("Should have thrown error on unsupported workspace ID");
	} catch (err: any) {
		if (!err.message.includes("is not in the configured workspaces list")) {
			throw err;
		}
	}
	console.log(
		"✓ Dictionary successfully validated workspace_id against allowed list.",
	);

	// Verify tag validation
	try {
		await dictStore.addExpression({
			term: "unsupported tag test",
			regexPattern: "test",
			isCaseInsensitive: true,
			targetAssignment: "MAIN_TERM",
			conceptId: "c_mi",
			priorityWeight: 1,
			active: true,
			context: {
				tags: ["billing"],
			},
		});
		throw new Error("Should have thrown error on unsupported tag");
	} catch (err: any) {
		if (!err.message.includes("is not in the configured allowed tags list")) {
			throw err;
		}
	}
	console.log("✓ Dictionary successfully validated tags against allowed list.");

	// Resolve alias
	const resolved = await dictStore.resolve("patient suffered a heart attack", {
		workspace_id: "global",
	});
	if (
		resolved.status !== "FOUND" ||
		resolved.results[0]?.conceptId !== "c_mi" ||
		resolved.results[0]?.concept.display !== "Myocardial Infarction"
	) {
		throw new Error(
			`Dictionary resolution failed. Got: ${JSON.stringify(resolved)}`,
		);
	}
	console.log(
		"✓ Dictionary resolved alias 'heart attack' using regex successfully.",
	);

	// Check metrics and usage-based score boosting
	const metrics = dictStore.getMetrics();
	if (metrics.length !== 1 || metrics[0]?.usageCount !== 1) {
		throw new Error("Usage metrics recording failed");
	}
	console.log("✓ Dictionary usage metrics recorded successfully.");

	// Resolve again to verify usage metrics score boosting works (initial priority 5 + usageCount 1 * 10 = 15)
	const resolvedSecond = await dictStore.resolve(
		"patient suffered a heart attack",
		{ workspace_id: "global" },
	);
	if (
		resolvedSecond.status !== "FOUND" ||
		resolvedSecond.results[0]?.score !== 15
	) {
		throw new Error(
			`Score boosting validation failed. Score: ${resolvedSecond?.results[0]?.score}`,
		);
	}
	console.log(
		"✓ Dictionary score boosting successfully recalculated (score: " +
			resolvedSecond.results[0]?.score +
			").",
	);

	// Find expressions
	const found = await dictStore.find(
		{ term: "heart" },
		{ workspace_id: "global" },
	);
	if (found.length !== 1 || found[0]?.id !== "expr_1") {
		throw new Error("Dictionary find expressions failed");
	}
	console.log("✓ Dictionary find expressions filtered successfully.");

	// Test Case 2: Multi-Backend Weighted Concept Resolution
	console.log("\n🧪 Test Case 2: Multi-Backend Weighted Concept Resolution");

	const personalBackend = {
		config: {
			id: "personal",
			defaultWeight: 0.8,
			minWeight: 0.1,
			maxWeight: 1.0,
		},
		currentWeight: 0.8,
		resolver: new InMemoryConceptResolver(),
		concepts: new Map([
			[
				"p_c_mi",
				{
					id: "p_c_mi",
					namespaceCode: "CUSTOM",
					standardCode: "P-I21.9",
					display: "Myocardial Infarction (Personal)",
				},
			],
		]),
		expressions: [
			{
				id: "p_expr",
				term: "heart attack",
				regexPattern: "\\bheart\\s+attack\\b",
				isCaseInsensitive: true,
				targetAssignment: "MAIN_TERM",
				conceptId: "p_c_mi",
				priorityWeight: 5,
				active: true,
			},
		],
		metrics: [],
	};

	const globalBackend = {
		config: {
			id: "global_backend",
			defaultWeight: 0.3,
			minWeight: 0.05,
			maxWeight: 0.5,
		},
		currentWeight: 0.3,
		resolver: new InMemoryConceptResolver(),
		concepts: new Map([
			[
				"g_c_mi",
				{
					id: "g_c_mi",
					namespaceCode: "SNOMED",
					standardCode: "I21.9",
					display: "Myocardial Infarction (Global)",
				},
			],
		]),
		expressions: [
			{
				id: "g_expr",
				term: "heart attack",
				regexPattern: "\\bheart\\s+attack\\b",
				isCaseInsensitive: true,
				targetAssignment: "MAIN_TERM",
				conceptId: "g_c_mi",
				priorityWeight: 5,
				active: true,
			},
		],
		metrics: [],
	};

	const {
		MultiBackendConceptResolver,
	} = require("../src/middleware/dictionary/resolver");
	const multiResolver = new MultiBackendConceptResolver([
		personalBackend,
		globalBackend,
	]);
	const multiStore = new DictionaryStore(multiResolver);

	// Initial resolution - Personal should win (weighted score: 5 * 0.8 = 4 vs Global: 5 * 0.3 = 1.5)
	const multiRes = await multiStore.resolve("heart attack");
	if (
		multiRes.status !== "FOUND" ||
		multiRes.results[0]?.conceptId !== "p_c_mi"
	) {
		throw new Error(
			`Multi-backend resolution failed. Expected p_c_mi, got: ${multiRes?.results[0]?.conceptId}`,
		);
	}
	console.log(
		"✓ Multi-backend resolved to the higher-weighted Personal backend candidate.",
	);

	// Verify weights got updated (Personal rewarded +0.05 -> 0.85, Global decayed -0.01 -> 0.29)
	const backends = multiResolver.getBackends();
	const personal = backends.find((b: any) => b.config.id === "personal");
	const globalB = backends.find((b: any) => b.config.id === "global_backend");

	if (!personal || personal.currentWeight !== 0.85) {
		throw new Error(
			`Personal weight adjustment failed. Expected 0.85, got: ${personal?.currentWeight}`,
		);
	}
	if (!globalB || globalB.currentWeight !== 0.29) {
		throw new Error(
			`Global weight adjustment failed. Expected 0.29, got: ${globalB?.currentWeight}`,
		);
	}
	console.log(
		"✓ Multi-backend weights adjusted successfully (winner rewarded, losers decayed).",
	);

	// Test Case 3: Coordinate Resolution with Double Colons
	console.log("\n🧪 Test Case 3: Coordinate Resolution with Double Colons");
	const testStore = new DictionaryStore(new InMemoryConceptResolver());
	await testStore.loadConfig({
		concepts: [
			{
				id: "c_snomed_mi",
				namespaceCode: "SNOMED",
				standardCode: "I21.9",
				display: "Myocardial Infarction",
			},
		],
	});

	const resolvedId = await testStore.resolveConceptId("SNOMED::I21.9");
	if (resolvedId !== "c_snomed_mi") {
		throw new Error(
			`Coordinate resolution with double colons failed. Expected c_snomed_mi, got: ${resolvedId}`,
		);
	}
	console.log(
		"✓ Successfully resolved concept by 'NAMESPACE::CODE' coordinate reference.",
	);

	const resolvedDirect = await testStore.resolveConceptId("c_snomed_mi");
	if (resolvedDirect !== "c_snomed_mi") {
		throw new Error(`Direct concept ID resolution failed.`);
	}
	console.log("✓ Successfully resolved concept by direct concept ID.");

	// Test Case 4: Namespace Mutability Constraints
	console.log("\n🧪 Test Case 4: Namespace Mutability Constraints");
	const mutStore = new DictionaryStore(new InMemoryConceptResolver());
	await mutStore.loadConfig({
		namespaces: [
			{
				code: "SNOMED",
				isPublic: true,
				isExternalPrivate: false,
				isMutable: false,
			},
			{
				code: "CUSTOM",
				isPublic: true,
				isExternalPrivate: false,
				isMutable: true,
			},
		],
		concepts: [
			{
				id: "c_snomed_1",
				namespaceCode: "SNOMED",
				standardCode: "111",
				display: "SNOMED Concept",
			},
			{
				id: "c_custom_1",
				namespaceCode: "CUSTOM",
				standardCode: "222",
				display: "Custom Concept 1",
			},
			{
				id: "c_custom_2",
				namespaceCode: "CUSTOM",
				standardCode: "333",
				display: "Custom Concept 2",
			},
		],
		relations: [
			{
				id: "rel_snomed",
				conceptId: "c_snomed_1",
				linkedId: "c_custom_1",
				relationshipType: "EQUIVALENT",
				active: true,
			},
		],
	});

	// Try adding concept to read-only namespace
	try {
		await mutStore.addConcept({
			namespaceCode: "SNOMED",
			standardCode: "444",
			display: "Forbidden Concept",
		});
		throw new Error(
			"Should have thrown error adding concept to read-only namespace",
		);
	} catch (err: any) {
		if (err.code !== "DICTIONARY_MUTATION_DENIED") throw err;
	}
	console.log("✓ Correctly prevented adding concept to read-only namespace.");

	// Try editing coordinate of custom concept
	try {
		await mutStore.editConcept("c_custom_1", { standardCode: "999" });
		throw new Error("Should have thrown error editing coordinate identity");
	} catch (err: any) {
		if (err.code !== "DICTIONARY_MUTATION_DENIED") throw err;
	}
	console.log("✓ Correctly prevented editing concept coordinate identity.");

	// Try adding relation with read-only namespace source
	try {
		await mutStore.addRelation({
			id: "rel_new",
			conceptId: "c_snomed_1",
			linkedId: "c_custom_2",
			relationshipType: "EQUIVALENT",
			active: true,
		});
		throw new Error(
			"Should have thrown error adding relation with read-only source concept",
		);
	} catch (err: any) {
		if (err.code !== "DICTIONARY_MUTATION_DENIED") throw err;
	}
	console.log(
		"✓ Correctly prevented adding relation involving read-only namespace.",
	);

	// Try removing relation with read-only concept
	try {
		await mutStore.removeRelation("rel_snomed");
		throw new Error(
			"Should have thrown error removing relation involving read-only concept",
		);
	} catch (err: any) {
		if (err.code !== "DICTIONARY_MUTATION_DENIED") throw err;
	}
	console.log(
		"✓ Correctly prevented removing relation involving read-only namespace.",
	);

	// Test Case 5: Soft-delete vs Hard-delete & Dependencies
	console.log("\n🧪 Test Case 5: Soft-delete vs Hard-delete & Dependencies");
	const delStore = new DictionaryStore(new InMemoryConceptResolver());
	await delStore.loadConfig({
		namespaces: [
			{
				code: "CUSTOM",
				isPublic: true,
				isExternalPrivate: false,
				isMutable: true,
			},
		],
		concepts: [
			{
				id: "c_1",
				namespaceCode: "CUSTOM",
				standardCode: "C1",
				display: "Concept 1",
			},
		],
		workspaces: [{ id: "global", name: "Global" }],
	});

	// Hard delete expression with no metrics
	const expId1 = await delStore.addExpression(
		{
			term: "temp term",
			regexPattern: "temp",
			isCaseInsensitive: true,
			targetAssignment: "MAIN_TERM",
			conceptId: "c_1",
			active: true,
			priorityWeight: 1,
			context: { workspace_id: "global" },
		},
		{ is_admin: true },
	);

	if ((await delStore.getExpressions()).length !== 1)
		throw new Error("Expression not added.");
	await delStore.removeExpression(expId1, { is_admin: true });
	if ((await delStore.getExpressions()).length !== 0)
		throw new Error("Hard delete failed for expression without metrics.");
	console.log("✓ Successfully hard-deleted expression with no usage metrics.");

	// Soft delete expression with metrics
	const expId2 = await delStore.addExpression(
		{
			term: "used term",
			regexPattern: "used",
			isCaseInsensitive: true,
			targetAssignment: "MAIN_TERM",
			conceptId: "c_1",
			active: true,
			priorityWeight: 1,
			context: { workspace_id: "global" },
		},
		{ is_admin: true },
	);

	delStore.recordUsage(expId2, "c_1", { workspace_id: "global" });
	await delStore.removeExpression(expId2, { is_admin: true });
	const expressionsList = await delStore.getExpressions();
	if (expressionsList.length !== 1 || expressionsList[0]?.active !== false) {
		throw new Error("Soft delete failed for expression with metrics.");
	}
	console.log(
		"✓ Successfully soft-deleted (deactivated) expression with usage metrics.",
	);

	// Try removing concept with active expression
	const expId3 = await delStore.addExpression(
		{
			term: "another term",
			regexPattern: "another",
			isCaseInsensitive: true,
			targetAssignment: "MAIN_TERM",
			conceptId: "c_1",
			active: true,
			priorityWeight: 1,
			context: { workspace_id: "global" },
		},
		{ is_admin: true },
	);

	try {
		await delStore.removeConcept("c_1");
		throw new Error(
			"Should have prevented concept removal when active expressions exist",
		);
	} catch (err: any) {
		if (err.code !== "DICTIONARY_MUTATION_DENIED") throw err;
	}
	console.log(
		"✓ Correctly prevented concept removal when active expression references it.",
	);

	// Deactivate expression and successfully remove concept (soft-delete)
	await delStore.removeExpression(expId3, { is_admin: true });
	await delStore.removeConcept("c_1");
	if ((await delStore.getConcept("c_1"))?.active !== false) {
		throw new Error("Concept soft-delete failed.");
	}
	console.log(
		"✓ Successfully soft-deleted concept after clearing referencing expressions.",
	);

	// Test Case 6: Scope-Aware Write Gates & Precedence
	console.log("\n🧪 Test Case 6: Scope-Aware Write Gates & Precedence");
	const scopeStore = new DictionaryStore(new InMemoryConceptResolver());
	await scopeStore.loadConfig({
		namespaces: [
			{
				code: "CUSTOM",
				isPublic: true,
				isExternalPrivate: false,
				isMutable: true,
			},
		],
		concepts: [
			{
				id: "c_global",
				namespaceCode: "CUSTOM",
				standardCode: "G",
				display: "Global Concept",
			},
			{
				id: "c_workspace",
				namespaceCode: "CUSTOM",
				standardCode: "W",
				display: "Workspace Concept",
			},
			{
				id: "c_user",
				namespaceCode: "CUSTOM",
				standardCode: "U",
				display: "User Concept",
			},
		],
		workspaces: [{ id: "dept_cardiology", name: "Cardiology" }],
	});

	// Test Scope-aware Write Gates
	// 1. Add global expression without admin privilege (should fail)
	try {
		await scopeStore.addExpression(
			{
				term: "test",
				regexPattern: "test",
				isCaseInsensitive: true,
				targetAssignment: "MAIN_TERM",
				conceptId: "c_global",
				priorityWeight: 1,
				active: true,
				context: { workspace_id: "global" },
			},
			{ is_admin: false },
		);
		throw new Error(
			"Should have thrown privilege denied for global expression add",
		);
	} catch (err: any) {
		if (err.code !== "DICTIONARY_MUTATION_DENIED") throw err;
	}
	console.log(
		"✓ Correctly prevented non-admin from creating global expression.",
	);

	// 2. Add workspace expression with mismatched workspace (should fail)
	try {
		await scopeStore.addExpression(
			{
				term: "test",
				regexPattern: "test",
				isCaseInsensitive: true,
				targetAssignment: "MAIN_TERM",
				conceptId: "c_workspace",
				priorityWeight: 1,
				active: true,
				context: { workspace_id: "dept_cardiology" },
			},
			{ workspace_id: "dept_pediatrics" },
		);
		throw new Error(
			"Should have thrown privilege denied for workspace expression add",
		);
	} catch (err: any) {
		if (err.code !== "DICTIONARY_MUTATION_DENIED") throw err;
	}
	console.log(
		"✓ Correctly prevented caller in different workspace from creating workspace expression.",
	);

	// 3. Add user expression with mismatched user (should fail)
	const expUser = await scopeStore.addExpression(
		{
			term: "user term",
			regexPattern: "user",
			isCaseInsensitive: true,
			targetAssignment: "MAIN_TERM",
			conceptId: "c_user",
			priorityWeight: 1,
			active: true,
			context: { user_id: "alice" },
		},
		{ user_id: "alice" },
	);

	try {
		await scopeStore.editExpression(
			expUser,
			{ term: "hacked" },
			{ user_id: "bob" },
		);
		throw new Error(
			"Should have thrown privilege denied for user expression edit",
		);
	} catch (err: any) {
		if (err.code !== "DICTIONARY_MUTATION_DENIED") throw err;
	}
	console.log(
		"✓ Correctly prevented modification of user-scoped expression by another user.",
	);

	// Test precedence resolution order
	// Add same term "symptom" at all three tiers pointing to different concepts
	await scopeStore.addExpression(
		{
			term: "symptom",
			regexPattern: "symptom",
			isCaseInsensitive: true,
			targetAssignment: "MAIN_TERM",
			conceptId: "c_global",
			priorityWeight: 1,
			active: true,
			context: { workspace_id: "global" },
		},
		{ is_admin: true },
	);

	await scopeStore.addExpression(
		{
			term: "symptom",
			regexPattern: "symptom",
			isCaseInsensitive: true,
			targetAssignment: "MAIN_TERM",
			conceptId: "c_workspace",
			priorityWeight: 1,
			active: true,
			context: { workspace_id: "dept_cardiology" },
		},
		{ workspace_id: "dept_cardiology" },
	);

	await scopeStore.addExpression(
		{
			term: "symptom",
			regexPattern: "symptom",
			isCaseInsensitive: true,
			targetAssignment: "MAIN_TERM",
			conceptId: "c_user",
			priorityWeight: 1,
			active: true,
			context: { user_id: "alice" },
		},
		{ user_id: "alice" },
	);

	// Resolve symptom as alice in dept_cardiology: should resolve to c_user (User scope wins)
	const resAlice = await scopeStore.resolve("symptom", {
		user_id: "alice",
		workspace_id: "dept_cardiology",
	});
	if (
		resAlice.status !== "FOUND" ||
		resAlice.results[0]?.conceptId !== "c_user"
	) {
		throw new Error(
			`Alice resolution failed. Got: ${resAlice.results[0]?.conceptId}`,
		);
	}
	console.log("✓ User-scope expression matches took priority correctly.");

	// Resolve symptom as bob in dept_cardiology: should resolve to c_workspace (Workspace scope wins)
	const resBob = await scopeStore.resolve("symptom", {
		user_id: "bob",
		workspace_id: "dept_cardiology",
	});
	if (
		resBob.status !== "FOUND" ||
		resBob.results[0]?.conceptId !== "c_workspace"
	) {
		throw new Error(
			`Bob resolution failed. Got: ${resBob.results[0]?.conceptId}`,
		);
	}
	console.log("✓ Workspace-scope expression matches took priority correctly.");

	// Resolve symptom as charlie in global: should resolve to c_global (Global scope wins)
	const resCharlie = await scopeStore.resolve("symptom", {
		user_id: "charlie",
		workspace_id: "global",
	});
	if (
		resCharlie.status !== "FOUND" ||
		resCharlie.results[0]?.conceptId !== "c_global"
	) {
		throw new Error(
			`Charlie resolution failed. Got: ${resCharlie.results[0]?.conceptId}`,
		);
	}
	console.log(
		"✓ Global-scope expression matches resolved correctly when no user/workspace matched.",
	);

	// Test Case 7: Bidirectional Concept Relations, Operator Inversion & Transitive Path Cache
	console.log(
		"\n🧪 Test Case 7: Bidirectional Concept Relations, Operator Inversion & Transitive Path Cache",
	);
	const relStore = new DictionaryStore(new InMemoryConceptResolver());
	await relStore.loadConfig({
		namespaces: [{ code: "SNOMED", isPublic: true, isExternalPrivate: false }],
		concepts: [
			{
				id: "c_heart_dis",
				namespaceCode: "SNOMED",
				standardCode: "H1",
				display: "Heart Disease",
			},
			{
				id: "c_mi_dis",
				namespaceCode: "SNOMED",
				standardCode: "H2",
				display: "Myocardial Infarction",
			},
			{
				id: "c_stemi",
				namespaceCode: "SNOMED",
				standardCode: "H3",
				display: "STEMI",
			},
		],
		relations: [
			{
				id: "rel_1",
				conceptId: "c_stemi",
				linkedId: "c_mi_dis",
				relationshipType: "NARROWER_THAN",
				active: true,
			},
			{
				id: "rel_2",
				conceptId: "c_mi_dis",
				linkedId: "c_heart_dis",
				relationshipType: "NARROWER_THAN",
				active: true,
			},
		],
	});

	// Forward lookups for c_stemi
	const forwardRels = await relStore.getRelatedConcepts(
		"c_stemi",
		"forward",
		2,
	);
	if (forwardRels.length !== 2) {
		throw new Error(
			`Expected 2 forward related concepts for STEMI, got ${forwardRels.length}`,
		);
	}
	const miForward = forwardRels.find((r) => r.concept.id === "c_mi_dis");
	if (
		!miForward ||
		miForward.relationshipType !== "NARROWER_THAN" ||
		miForward.depth !== 1
	) {
		throw new Error("Forward relation for STEMI -> MI failed");
	}
	console.log("✓ Forward concept relations resolved successfully.");

	// Reverse lookups for c_heart_dis (Heart Disease) -> expect MI & STEMI with WIDER_THAN operator inversion
	const reverseRels = await relStore.getRelatedConcepts(
		"c_heart_dis",
		"reverse",
		2,
	);
	if (reverseRels.length !== 2) {
		throw new Error(
			`Expected 2 reverse related concepts for Heart Disease, got ${reverseRels.length}`,
		);
	}
	const miReverse = reverseRels.find((r) => r.concept.id === "c_mi_dis");
	if (
		!miReverse ||
		miReverse.relationshipType !== "WIDER_THAN" ||
		miReverse.depth !== 1
	) {
		throw new Error(
			`Reverse relation operator inversion failed: expected WIDER_THAN, got ${miReverse?.relationshipType}`,
		);
	}
	const stemiReverse = reverseRels.find((r) => r.concept.id === "c_stemi");
	if (
		!stemiReverse ||
		stemiReverse.relationshipType !== "WIDER_THAN" ||
		stemiReverse.depth !== 2
	) {
		throw new Error(
			`Multi-hop reverse relation operator inversion failed: expected WIDER_THAN at depth 2, got ${stemiReverse?.relationshipType}`,
		);
	}
	console.log(
		"✓ Reverse concept relation lookups with operator duality inversion (NARROWER_THAN -> WIDER_THAN) verified successfully.",
	);

	// Test cache hit & invalidation
	const cachedReverse = await relStore.getRelatedConcepts(
		"c_heart_dis",
		"reverse",
		2,
		true,
	);
	if (cachedReverse.length !== 2) {
		throw new Error("Transitive path cache retrieval failed");
	}
	console.log("✓ Transitive closure relation cache hit verified successfully.");
}
