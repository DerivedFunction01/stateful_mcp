import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type {
	EventStore,
	FilterStore,
	FormStore,
	MiddlewareConfig,
	ObjectStore,
} from "@stateful-mcp/core";
import { z } from "zod";
import {
	getEventStore,
	getFilterStore,
	getFormStore,
	getObjectStore,
} from "./helper.js";

/** Required store types inferred from all tool state_requirements across the config. */
type StoreType = "filter" | "object" | "form" | "event";

/**
 * Probe a store with a no-op lookup. Returns true if responsive, false on any throw.
 * We consider a null-return (not found) as healthy — the store responded.
 */
async function probeStore(probe: () => Promise<unknown>): Promise<boolean> {
	try {
		await probe();
		return true;
	} catch {
		return false;
	}
}

/**
 * Determine which store types are actually needed by scanning all tools'
 * state_requirements in the config. Does not assume anything about
 * which stores are present.
 */
function requiredStoreTypes(config: MiddlewareConfig): Set<StoreType> {
	const needed = new Set<StoreType>();
	for (const toolCfg of Object.values(config.tools ?? {})) {
		for (const req of toolCfg.state_requirements ?? []) {
			needed.add(req.type);
		}
	}
	return needed;
}

/**
 * Register the state_init tool on an MCP server and run a startup health probe.
 *
 * This function is async and MUST be awaited and called AFTER the server's
 * other tools have been registered, since it probes stores at registration time
 * to validate that every store type referenced in the config's state_requirements
 * is actually reachable. It throws (crashing the server) if a required store
 * is unreachable so misconfiguration is caught at startup, not at runtime.
 *
 * @param server        - The MCP server instance.
 * @param config        - The loaded MiddlewareConfig for this workspace.
 * @param workspaceRoot - Absolute path to the config directory.
 */
export async function registerStateInitTool(
	server: McpServer,
	config: MiddlewareConfig,
	workspaceRoot: string,
): Promise<void> {
	// Instantiate all four store types unconditionally — any of them may be
	// referenced by a tool's state_requirements regardless of which server
	// module is currently running.
	const filterStore: FilterStore = getFilterStore(config, workspaceRoot);
	const objectStore: ObjectStore = getObjectStore(config, workspaceRoot);
	const formStore: FormStore = getFormStore(config, workspaceRoot);
	const eventStore: EventStore = getEventStore(config, workspaceRoot);

	// ── Startup health probe ─────────────────────────────────────────────────────
	// Determine which store types are actually needed by this config's tools.
	const needed = requiredStoreTypes(config);

	if (needed.size > 0) {
		const probeSession = "__probe__";
		const results: Record<StoreType, boolean> = {
			filter: true,
			object: true,
			form: true,
			event: true,
		};

		if (needed.has("filter")) {
			results.filter = await probeStore(() =>
				filterStore.getFilter(probeSession, probeSession),
			);
		}
		if (needed.has("object")) {
			results.object = await probeStore(() =>
				objectStore.getObject(probeSession, probeSession),
			);
		}
		if (needed.has("form")) {
			results.form = await probeStore(() =>
				formStore.getForm(probeSession, probeSession),
			);
		}
		if (needed.has("event")) {
			results.event = await probeStore(() =>
				eventStore.getCommit(probeSession, probeSession),
			);
		}

		const failed = (Object.entries(results) as [StoreType, boolean][])
			.filter(([type, ok]) => needed.has(type) && !ok)
			.map(([type]) => type);

		if (failed.length > 0) {
			throw new Error(
				`state_init startup probe failed — the following required stores are unreachable: ${failed.join(", ")}. ` +
					`Check your storage.config.json configuration.`,
			);
		}

		console.error(
			`[state_init] Startup probe passed for stores: ${[...needed].join(", ")}`,
		);
	}

	// ── Register the MCP tool ────────────────────────────────────────────────────
	server.registerTool(
		"state_init",
		{
			description:
				"Initialize all state dependencies required by a configured tool in one call. " +
				"Returns semantic alias names (not raw IDs) for each initialized state. " +
				"Calling twice without a suffix auto-increments the alias (_2, _3, …).",
			inputSchema: {
				tool_name: z
					.string()
					.describe(
						"The name of the tool whose state_requirements should be initialized.",
					),
				suffix: z
					.string()
					.optional()
					.describe(
						"Optional suffix appended to every alias in this batch " +
							"(e.g. 'electronics', '2'). If omitted and the default alias already " +
							"exists in the session, the next available numeric suffix is auto-assigned.",
					),
			},
		},
		async ({ tool_name, suffix }, extra: any) => {
			try {
				const session_id: string = extra?._metadata?.session_id ?? "default";
				const user_id: string | undefined = extra?._metadata?.user_id;

				const toolConfig = config.tools?.[tool_name];
				if (!toolConfig) {
					throw new Error(`Tool "${tool_name}" not found in configuration.`);
				}

				const requirements = toolConfig.state_requirements ?? [];
				if (requirements.length === 0) {
					return {
						content: [
							{
								type: "text" as const,
								text: JSON.stringify(
									{
										message: `No state_requirements configured for tool "${tool_name}".`,
									},
									null,
									2,
								),
							},
						],
					};
				}

				const results: {
					filters: Record<string, string>;
					objects: Record<string, string>;
					forms: Record<string, string>;
					events: Record<string, string>;
				} = { filters: {}, objects: {}, forms: {}, events: {} };

				for (const req of requirements) {
					const baseAlias = req.alias;
					let finalAlias: string | undefined;

					if (baseAlias) {
						if (suffix) {
							// Explicit suffix — idempotent on repeated calls with same suffix.
							finalAlias = `${baseAlias}_${suffix}`;
						} else {
							// No suffix: try base alias first, auto-increment if taken.
							let counter = 1;
							while (true) {
								const candidate =
									counter === 1 ? baseAlias : `${baseAlias}_${counter}`;
								const taken = await aliasExists(
									req.type,
									candidate,
									session_id,
									user_id,
								);
								if (!taken) {
									finalAlias = candidate;
									break;
								}
								counter++;
							}
						}
					}

					// Idempotency: if a suffixed alias already exists, return it without re-creating.
					if (finalAlias && suffix) {
						const existing = await getExistingId(
							req.type,
							finalAlias,
							session_id,
							user_id,
						);
						if (existing) {
							bucket(results, req.type)[req.id] = finalAlias;
							continue;
						}
					}

					// Initialize new state.
					if (req.type === "filter") {
						await filterStore.init(
							session_id,
							req.toolName,
							req.tableName,
							user_id,
							finalAlias,
						);
					} else if (req.type === "object") {
						await objectStore.init(req.schema ?? "", session_id, finalAlias);
					} else if (req.type === "form") {
						await formStore.init(req.schema ?? "", session_id, finalAlias);
					} else if (req.type === "event") {
						await eventStore.init(req.schema ?? "", session_id, finalAlias);
					}

					bucket(results, req.type)[req.id] =
						finalAlias ?? `<id assigned by ${req.type}>`;
				}

				return {
					content: [
						{ type: "text" as const, text: JSON.stringify(results, null, 2) },
					],
				};
			} catch (err: any) {
				return {
					content: [
						{ type: "text" as const, text: err.message || String(err) },
					],
					isError: true,
				};
			}

			async function aliasExists(
				type: StoreType,
				alias: string,
				sid: string,
				uid?: string,
			): Promise<boolean> {
				return (await getExistingId(type, alias, sid, uid)) !== null;
			}

			async function getExistingId(
				type: StoreType,
				alias: string,
				sid: string,
				uid?: string,
			): Promise<string | null> {
				if (type === "filter") {
					const s = await filterStore.getFilter(alias, sid, uid);
					return s?.filterId ?? null;
				}
				if (type === "object") {
					const s = await objectStore.getObject(alias, sid, uid);
					return s?.objectId ?? null;
				}
				if (type === "form") {
					const s = await formStore.getForm(alias, sid);
					return s?.formId ?? null;
				}
				if (type === "event") {
					const s = await eventStore.getCommit(alias, sid);
					return s?.commitId ?? null;
				}
				return null;
			}
		},
	);
}

function bucket(
	results: {
		filters: Record<string, string>;
		objects: Record<string, string>;
		forms: Record<string, string>;
		events: Record<string, string>;
	},
	type: string,
): Record<string, string> {
	if (type === "filter") return results.filters;
	if (type === "object") return results.objects;
	if (type === "form") return results.forms;
	return results.events;
}
