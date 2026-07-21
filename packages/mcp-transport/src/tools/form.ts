import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { FormSchema, MiddlewareConfig } from "@stateful-mcp/core";
import {
	FormStore,
	JsonlPersistentFormStore,
	JsonlSessionFormStore,
	loadMiddlewareConfig,
	MemoryPersistentFormStore,
	MemorySessionFormStore,
	resolveAboutOrExamples,
	resolveConfigDir,
	resolveSource,
	SqliteFormStore,
	validateMiddlewareConfig,
} from "@stateful-mcp/core";
import * as path from "path";
import { fileURLToPath } from "url";
import { z } from "zod";
import { getFilterStore, getObjectStore } from "./helper";
import { registerStateInitTool } from "./state_init.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const localAboutDir = path.resolve(__dirname, "../about");
const localExamplesDir = path.resolve(__dirname, "../examples");

const server = new McpServer({
	name: "form-service",
	version: "1.0.0",
});

let formStore: FormStore;
let config: MiddlewareConfig;
let configDir: string = process.cwd();

function registerFormTools() {
	server.registerTool(
		"form_init",
		{
			description:
				"Initialize a new dynamic form session state against a schema.",
			inputSchema: {
				schema_name: z
					.string()
					.describe("The name of the registered form schema."),
				alias: z
					.string()
					.optional()
					.describe("Optional alias to tag the initial form checkpoint."),
				parent_form_id: z
					.string()
					.optional()
					.describe("Optional parent form state checkpoint to branch from."),
				get_schema_hint: z
					.boolean()
					.optional()
					.describe(
						"If true, returns the Form schema definition in the response to guide question flow.",
					),
			},
		},
		async (
			{ schema_name, alias, parent_form_id, get_schema_hint },
			extra: any,
		) => {
			const session_id = extra?._metadata?.session_id ?? "default";
			try {
				const formId = await formStore.init(
					schema_name,
					session_id,
					alias,
					parent_form_id,
				);
				const res: Record<string, any> = { form_id: formId };
				if (get_schema_hint) {
					res.schema_hint = formStore.getSchema(schema_name);
				}
				return { content: [{ type: "text", text: JSON.stringify(res) }] };
			} catch (err: any) {
				return {
					content: [{ type: "text", text: err.message || String(err) }],
					isError: true,
				};
			}
		},
	);

	server.registerTool(
		"form_answer",
		{
			description:
				"Submit an answer for a specific question. Updates dynamic routing navigation state.",
			inputSchema: {
				form_id: z.string().describe("The form checkpoint ID or alias."),
				question_id: z.string().describe("The question ID being answered."),
				value: z.any().describe("The value for the answer."),
				new_alias: z
					.string()
					.optional()
					.describe("Optional new alias for the newly created checkpoint."),
			},
		},
		async ({ form_id, question_id, value, new_alias }, extra: any) => {
			const session_id = extra?._metadata?.session_id ?? "default";
			try {
				const result = await formStore.answer(
					form_id,
					question_id,
					value,
					session_id,
					new_alias,
				);
				return { content: [{ type: "text", text: JSON.stringify(result) }] };
			} catch (err: any) {
				return {
					content: [{ type: "text", text: err.message || String(err) }],
					isError: true,
				};
			}
		},
	);

	server.registerTool(
		"form_skip",
		{
			description:
				"Explicitly skip an optional question. Advances routing path.",
			inputSchema: {
				form_id: z.string().describe("The form checkpoint ID or alias."),
				question_id: z.string().describe("The question ID to skip."),
				new_alias: z
					.string()
					.optional()
					.describe("Optional new alias for the newly created checkpoint."),
			},
		},
		async ({ form_id, question_id, new_alias }, extra: any) => {
			const session_id = extra?._metadata?.session_id ?? "default";
			try {
				const result = await formStore.skip(
					form_id,
					question_id,
					session_id,
					new_alias,
				);
				return { content: [{ type: "text", text: JSON.stringify(result) }] };
			} catch (err: any) {
				return {
					content: [{ type: "text", text: err.message || String(err) }],
					isError: true,
				};
			}
		},
	);

	server.registerTool(
		"form_back",
		{
			description:
				"Navigate backward in history, shifting focus to a prior question.",
			inputSchema: {
				form_id: z.string().describe("The form checkpoint ID or alias."),
				question_id: z
					.string()
					.describe("The target question ID to focus back on."),
				new_alias: z
					.string()
					.optional()
					.describe("Optional new alias for the newly created checkpoint."),
			},
		},
		async ({ form_id, question_id, new_alias }, extra: any) => {
			const session_id = extra?._metadata?.session_id ?? "default";
			try {
				const result = await formStore.back(
					form_id,
					question_id,
					session_id,
					new_alias,
				);
				return { content: [{ type: "text", text: JSON.stringify(result) }] };
			} catch (err: any) {
				return {
					content: [{ type: "text", text: err.message || String(err) }],
					isError: true,
				};
			}
		},
	);

	server.registerTool(
		"form_resolve",
		{
			description: "Retrieve the final resolved form payload if complete.",
			inputSchema: {
				form_id: z.string().describe("The form checkpoint ID or alias."),
			},
		},
		async ({ form_id }, extra: any) => {
			const session_id = extra?._metadata?.session_id ?? "default";
			try {
				const result = await formStore.resolve(form_id, session_id);
				return { content: [{ type: "text", text: JSON.stringify(result) }] };
			} catch (err: any) {
				return {
					content: [{ type: "text", text: err.message || String(err) }],
					isError: true,
				};
			}
		},
	);

	server.registerTool(
		"form_inspect",
		{
			description:
				"Inspect the history of answers and checkpoints. Can filter to a single question.",
			inputSchema: {
				form_id: z.string().describe("The form checkpoint ID or alias."),
				question_id: z
					.string()
					.optional()
					.describe("Optional question ID to inspect history for."),
			},
		},
		async ({ form_id, question_id }, extra: any) => {
			const session_id = extra?._metadata?.session_id ?? "default";
			try {
				const result = await formStore.inspect(
					form_id,
					question_id,
					session_id,
				);
				return { content: [{ type: "text", text: JSON.stringify(result) }] };
			} catch (err: any) {
				return {
					content: [{ type: "text", text: err.message || String(err) }],
					isError: true,
				};
			}
		},
	);

	server.registerTool(
		"form_save",
		{
			description:
				"Promote and persist a form checkpoint state to user/global scope",
			inputSchema: {
				form_id: z.string().describe("The form checkpoint ID to persist."),
				tags: z.array(z.string()).describe("Searchable tags."),
				description: z.string().describe("Purpose description."),
				scope: z
					.enum(["session", "user", "global"])
					.describe("Ownership level."),
			},
		},
		async ({ form_id, tags, description, scope }, extra: any) => {
			const session_id = extra?._metadata?.session_id ?? "default";
			try {
				const ownerScope =
					scope === "global"
						? { level: "global" as const }
						: { level: "user" as const, userId: "" };
				const savedId = await formStore.save(
					form_id,
					tags,
					description,
					ownerScope,
					session_id,
				);
				return {
					content: [
						{ type: "text", text: JSON.stringify({ saved_id: savedId }) },
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

	server.registerTool(
		"form_about",
		{
			description: "Returns form service overview and strategy guidelines.",
			inputSchema: {},
		},
		async () => {
			try {
				const about = await resolveAboutOrExamples(
					config.about_and_examples?.form_about,
					path.join(localAboutDir, "form.md"),
					configDir,
				);
				return { content: [{ type: "text", text: about }] };
			} catch (err: any) {
				return {
					content: [{ type: "text", text: err.message || String(err) }],
					isError: true,
				};
			}
		},
	);

	server.registerTool(
		"form_examples",
		{
			description: "Returns form service worked dialogue examples.",
			inputSchema: {},
		},
		async () => {
			try {
				const examples = await resolveAboutOrExamples(
					config.about_and_examples?.form_examples,
					path.join(localExamplesDir, "form.md"),
					configDir,
				);
				return { content: [{ type: "text", text: examples }] };
			} catch (err: any) {
				return {
					content: [{ type: "text", text: err.message || String(err) }],
					isError: true,
				};
			}
		},
	);
}

async function main() {
	const workspaceRoot = resolveConfigDir();
	configDir = workspaceRoot;
	config = await loadMiddlewareConfig(workspaceRoot);
	validateMiddlewareConfig(config);

	const getUrl = (locator: any) => {
		if (locator?._type === "adapter") return locator.options?.url?.toString();
		return undefined;
	};

	const sessUrl = getUrl(config.form_session_state);
	const sessionFormStore =
		config.form_session_state?._type === "file" &&
		config.form_session_state.path.endsWith(".jsonl")
			? new JsonlSessionFormStore(
					path.resolve(workspaceRoot, config.form_session_state.path),
				)
			: sessUrl && sessUrl.startsWith("sqlite://")
				? new SqliteFormStore(sessUrl.replace("sqlite://", ""))
				: new MemorySessionFormStore();

	const globUrl = getUrl(config.form_persistent_state?.global);
	const persistentFormStore =
		config.form_persistent_state?.global?._type === "file" &&
		config.form_persistent_state.global.path.endsWith(".jsonl")
			? new JsonlPersistentFormStore(
					path.resolve(workspaceRoot, config.form_persistent_state.global.path),
				)
			: globUrl && globUrl.startsWith("sqlite://")
				? new SqliteFormStore(globUrl.replace("sqlite://", ""))
				: new MemoryPersistentFormStore();

	const formSchemas = new Map<string, FormSchema>();
	if (config.form_schemas) {
		for (const [schemaName, entry] of Object.entries(config.form_schemas)) {
			try {
				const locator = (entry as any).schema ?? entry;
				const schema = (await resolveSource(locator, configDir)) as FormSchema;
				formSchemas.set(schemaName, schema);
			} catch (err: any) {
				console.error(
					`Failed to load form schema "${schemaName}":`,
					err.message || err,
				);
			}
		}
	}

	formStore = new FormStore(sessionFormStore, persistentFormStore, formSchemas);

	const filterStore = getFilterStore(config, workspaceRoot);
	const objectStore = getObjectStore(config, workspaceRoot);
	formStore.setReferences({ filter: filterStore, object: objectStore });

	registerFormTools();
	await registerStateInitTool(server, config, workspaceRoot);

	const transport = new StdioServerTransport();
	await server.connect(transport);
	console.error("Stateful MCP Form Service running on stdio");
}

main().catch((err) => {
	console.error("Fatal error in form service:", err);
	process.exit(1);
});
