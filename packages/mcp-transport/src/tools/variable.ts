import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
	loadMiddlewareConfig,
	MemoryVariableStore,
	resolveAboutOrExamples,
	resolveConfigDir,
	type VariableInputEntry,
	type VariableService,
	VariableServiceStore,
} from "@stateful-mcp/core";
import * as path from "path";
import { fileURLToPath } from "url";
import { z } from "zod";
import {
	getVariableStore as getSharedVariableStore,
	setVariableStore as setSharedVariableStore,
} from "./helper";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const localAboutDir = path.resolve(__dirname, "../about");
const localExamplesDir = path.resolve(__dirname, "../examples");

// ---------------------------------------------------------------------------
// Shared schema fragments — defined once, reused across tools
// ---------------------------------------------------------------------------

// Condition-assertion ops only. Full OpName also includes arithmetic/date/math
// which are not relevant for variable condition rules.
const OP_ENUM = z
	.enum([
		"eq",
		"neq", // = != (any type: number, string, boolean)
		"lt",
		"leq",
		"geq",
		"gt", // < <= >= > (numeric)
		"in_set",
		"not_in_set", // IN (...) NOT IN (...) (any scalar, use target_values)
		"starts_with",
		"ends_with",
		"str_contains", // LIKE 'x%' '%x' '%x%'
	])
	.describe(
		"SQL-like condition operators (eq neq lt leq geq gt in_set not_in_set starts_with ends_with str_contains).",
	);

const CONDITION_SCHEMA = z
	.object({
		op: OP_ENUM,
		target_value: z
			.any()
			.optional()
			.describe("Scalar target (scalar ops). E.g. 20."),
		target_values: z
			.array(z.any())
			.optional()
			.describe("Set of values (in_set / not_in_set). E.g. ['a','b']."),
	})
	.describe(
		"Condition rule. Use target_value for scalar ops, target_values for set ops. str_contains / starts_with / ends_with accept plain substrings — no %% padding needed.",
	);

const BLOCK_ID = z
	.string()
	.optional()
	.describe("Block instance scope. Omit for session-global scope.");

// ---------------------------------------------------------------------------

export function registerVariableTools(server: McpServer) {
	let variableService: VariableService = getSharedVariableStore();
	if (!variableService) {
		variableService = new VariableServiceStore(new MemoryVariableStore());
		setSharedVariableStore(variableService);
	}

	// 1. variable_mutate — set or update variables (array or key-value object)
	server.registerTool(
		"variable_mutate",
		{
			description:
				"Set or update session variables. Accepts a key-value object or an array of entries with optional condition rules.",
			inputSchema: {
				action: z
					.enum(["set", "update"])
					.default("set")
					.describe("'set' creates/overwrites; 'update' patches existing."),
				variables: z.union([
					z.record(z.string(), z.any()),
					z.array(
						z.object({
							key: z.string(),
							value: z.any().optional(),
							condition: CONDITION_SCHEMA.optional(),
							block_instance_id: BLOCK_ID,
						}),
					),
				]),
				block_instance_id: BLOCK_ID,
			},
		},
		async ({ action, variables, block_instance_id }, extra: any) => {
			const sessionId = extra?._metadata?.session_id ?? "default";
			try {
				let entriesCount = 0;
				if (Array.isArray(variables)) {
					const entries: VariableInputEntry[] = variables.map((v) => {
						const condition = v.condition
							? {
									op: v.condition.op as any,
									...(v.condition.target_values !== undefined
										? { targetValues: v.condition.target_values }
										: { targetValue: v.condition.target_value }),
								}
							: undefined;
						return {
							key: v.key,
							value: v.value,
							condition,
							blockInstanceId: v.block_instance_id || block_instance_id,
						};
					});
					entriesCount = entries.length;
					await variableService.setVariables(
						sessionId,
						entries,
						block_instance_id,
					);
				} else {
					entriesCount = Object.keys(variables).length;
					await variableService.setVariables(
						sessionId,
						variables,
						block_instance_id,
					);
				}

				const activeScope = await variableService.getScope(
					sessionId,
					block_instance_id,
				);
				return {
					content: [
						{
							type: "text",
							text: JSON.stringify(
								{
									status: "success",
									action,
									session_id: sessionId,
									block_instance_id: block_instance_id || null,
									mutated_count: entriesCount,
									scope: activeScope,
								},
								null,
								2,
							),
						},
					],
				};
			} catch (err: any) {
				return {
					content: [{ type: "text", text: err.message || String(err) }],
					isError: true,
				};
			}
		},
	);

	// 2. variable_get — retrieve one, many, or full scope
	server.registerTool(
		"variable_get",
		{
			description:
				"Retrieve variables. Omit keys to return the full active scope.",
			inputSchema: {
				keys: z.union([z.string(), z.array(z.string())]).optional(),
				block_instance_id: BLOCK_ID,
			},
		},
		async ({ keys, block_instance_id }, extra: any) => {
			const sessionId = extra?._metadata?.session_id ?? "default";
			try {
				const result = await variableService.getVariable(
					sessionId,
					keys,
					block_instance_id,
				);
				return {
					content: [
						{
							type: "text",
							text: JSON.stringify(
								{
									session_id: sessionId,
									block_instance_id: block_instance_id || null,
									data: result,
								},
								null,
								2,
							),
						},
					],
				};
			} catch (err: any) {
				return {
					content: [{ type: "text", text: err.message || String(err) }],
					isError: true,
				};
			}
		},
	);

	// 3. variable_remove — delete keys or clear a block scope
	server.registerTool(
		"variable_remove",
		{
			description:
				"Remove variables by key(s), or clear an entire block instance scope.",
			inputSchema: {
				keys: z.union([z.string(), z.array(z.string())]).optional(),
				clear_block: z
					.boolean()
					.optional()
					.describe("Clear all variables in the block instance scope."),
				block_instance_id: BLOCK_ID,
			},
		},
		async ({ keys, clear_block, block_instance_id }, extra: any) => {
			const sessionId = extra?._metadata?.session_id ?? "default";
			try {
				if (clear_block && block_instance_id) {
					await variableService.clearBlockScope(sessionId, block_instance_id);
				} else if (keys) {
					await variableService.deleteVariable(
						sessionId,
						keys,
						block_instance_id,
					);
				}

				const scope = await variableService.getScope(
					sessionId,
					block_instance_id,
				);
				return {
					content: [
						{
							type: "text",
							text: JSON.stringify(
								{
									status: "success",
									session_id: sessionId,
									block_instance_id: block_instance_id || null,
									remaining_scope: scope,
								},
								null,
								2,
							),
						},
					],
				};
			} catch (err: any) {
				return {
					content: [{ type: "text", text: err.message || String(err) }],
					isError: true,
				};
			}
		},
	);

	// 4. variable_test — evaluate one or more test values against stored condition rules
	server.registerTool(
		"variable_test",
		{
			description:
				"Test values against stored variable condition rules. Returns pass/fail per entry.",
			inputSchema: {
				tests: z
					.array(
						z.object({
							key: z.string(),
							test_value: z.any(),
							op_override: OP_ENUM.optional(),
						}),
					)
					.describe(
						"Array of test entries. Each entry evaluates test_value against the condition stored on key.",
					),
				block_instance_id: BLOCK_ID,
			},
		},
		async ({ tests, block_instance_id }, extra: any) => {
			const sessionId = extra?._metadata?.session_id ?? "default";
			try {
				const evaluations = await Promise.all(
					tests.map((t) =>
						variableService.testVariableCondition(
							sessionId,
							t.key,
							t.test_value,
							t.op_override as any,
							block_instance_id,
						),
					),
				);
				const allPassed = evaluations.every((e) => e.passed);
				return {
					content: [
						{
							type: "text",
							text: JSON.stringify(
								{
									status: "success",
									session_id: sessionId,
									block_instance_id: block_instance_id || null,
									all_passed: allPassed,
									evaluations,
								},
								null,
								2,
							),
						},
					],
				};
			} catch (err: any) {
				return {
					content: [{ type: "text", text: err.message || String(err) }],
					isError: true,
				};
			}
		},
	);

	// 5. Developer guidance meta-tools
	server.registerTool(
		"variable_about",
		{
			description:
				"Retrieve documentation and guidelines for using the Variable Service.",
			inputSchema: {},
		},
		async () => {
			try {
				const configDir = resolveConfigDir(undefined);
				const config = loadMiddlewareConfig(configDir);
				const text = await resolveAboutOrExamples(
					config.about_and_examples?.variable_about,
					localAboutDir,
					"variable.md",
				);
				return { content: [{ type: "text", text }] };
			} catch (err: any) {
				return {
					content: [{ type: "text", text: err.message || String(err) }],
					isError: true,
				};
			}
		},
	);

	server.registerTool(
		"variable_examples",
		{
			description:
				"Retrieve example workflows and schema snippets for the Variable Service.",
			inputSchema: {},
		},
		async () => {
			try {
				const configDir = resolveConfigDir(undefined);
				const config = loadMiddlewareConfig(configDir);
				const text = await resolveAboutOrExamples(
					config.about_and_examples?.variable_examples,
					localExamplesDir,
					"variable.md",
				);
				return { content: [{ type: "text", text }] };
			} catch (err: any) {
				return {
					content: [{ type: "text", text: err.message || String(err) }],
					isError: true,
				};
			}
		},
	);
}

const server = new McpServer({
	name: "variable-service",
	version: "1.0.0",
});

async function main() {
	const { StdioServerTransport } = await import(
		"@modelcontextprotocol/sdk/server/stdio.js"
	);
	registerVariableTools(server);
	const transport = new StdioServerTransport();
	await server.connect(transport);
}

main().catch((err) => {
	console.error("Fatal error starting variable MCP service:", err);
	process.exit(1);
});
