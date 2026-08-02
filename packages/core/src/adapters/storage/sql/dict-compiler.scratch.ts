import { DictionarySqlCompiler } from "./dict-compiler";
import { DictionaryQueryPlanner } from "./dict-planner";

/** Internal PostgreSQL-first AST inspection harness. */
export function runDictionaryCompilerScratch(): void {
	const compiler = new DictionarySqlCompiler({
		dialect: "postgres",
		includeRelationCache: true,
	});
	const schema = compiler.compileSchema();
	const exact = compiler.compileExpressionCandidates({
		lookupTerm: "shortness of breath",
		activeOnly: true,
		limit: 20,
	});
	const prefix = compiler.compileExpressionCandidates({
		lookupPrefix: "short",
		activeOnly: true,
		limit: 10,
	});
	const joined = compiler.compileJoinedCandidates({
		lookupPrefix: "short",
		roleName: "subjective.qualifier",
		activeOnly: true,
		limit: 10,
	});
	const expressionFilter = compiler.compileExpressionFilterCandidates({
		lookupPrefix: "short",
		roleName: "subjective.qualifier",
		activeOnly: true,
		limit: 10,
	});
	const planner = new DictionaryQueryPlanner();
	const topologyPlan = planner.plan(
		{
			concepts: {
				domain: "concepts",
				backendKind: "sql",
				connectionId: "pg-main",
				tenantId: "tenant-a",
				dialect: "postgres",
			},
			expressions: {
				domain: "expressions",
				backendKind: "sql",
				connectionId: "pg-main",
				tenantId: "tenant-a",
				dialect: "postgres",
			},
			filters: {
				domain: "filters",
				backendKind: "sql",
				connectionId: "pg-main",
				tenantId: "tenant-a",
				dialect: "postgres",
			},
		},
		{ lookupPrefix: "short", roleName: "subjective.qualifier", limit: 10 },
	);
	console.log("[dict scratch] postgres schema ddl", schema.ddl);
	console.log("[dict scratch] postgres schema indexes", schema.indexes);
	console.log("[dict scratch] postgres exact candidate query", exact);
	console.log("[dict scratch] postgres prefix candidate query", prefix);
	console.log("[dict scratch] postgres joined candidate query", joined);
	console.log(
		"[dict scratch] postgres expression/filter pair query",
		expressionFilter,
	);
	console.log("[dict scratch] postgres topology plan", topologyPlan);
}

if (process.argv.includes("--run-dict-compiler-scratch")) {
	runDictionaryCompilerScratch();
}
