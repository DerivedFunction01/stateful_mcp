import {
	createRepo,
	EventStore,
	FilterStore,
	FormStore,
	ObjectStore,
	resolveSource,
} from "@stateful-mcp/core";
import type {
	BackendSpec,
	RepoConfig,
} from "@stateful-mcp/core/src/adapters/storage/shared/unified-repo";
import type {
	FormSchema,
	MiddlewareConfig,
	TableSchema,
} from "@stateful-mcp/core/src/config/types";
import * as path from "path";

function toBackendSpec(locator: any, workspaceRoot: string): BackendSpec {
	if (!locator) return { type: "memory" };
	if (locator._type === "file" && locator.path?.endsWith(".jsonl"))
		return { type: "jsonl", target: path.resolve(workspaceRoot, locator.path) };
	if (locator._type === "adapter") {
		const url = locator.options?.url?.toString();
		if (url?.startsWith("sqlite://"))
			return { type: "sqlite", target: url.replace("sqlite://", "") };
	}
	return { type: "memory" };
}

function toRepoConfig(
	config: MiddlewareConfig,
	workspaceRoot: string,
): RepoConfig {
	return {
		filter: {
			session: toBackendSpec(config.filter_session_state, workspaceRoot),
			persistent: toBackendSpec(
				config.filter_persistent_state?.global,
				workspaceRoot,
			),
		},
		form: {
			session: toBackendSpec(config.form_session_state, workspaceRoot),
			persistent: toBackendSpec(
				config.form_persistent_state?.global,
				workspaceRoot,
			),
		},
		object: {
			session: toBackendSpec(config.object_session_state, workspaceRoot),
			persistent: toBackendSpec(
				config.object_persistent_state?.global,
				workspaceRoot,
			),
		},
		event: {
			session: toBackendSpec(config.event_session_state, workspaceRoot),
			persistent: toBackendSpec(
				config.event_persistent_state?.global,
				workspaceRoot,
			),
		},
	};
}

export async function getFilterStore(
	config: MiddlewareConfig,
	workspaceRoot: string,
): Promise<FilterStore> {
	const adapter = await createRepo(toRepoConfig(config, workspaceRoot));

	const toolSchemas = new Map<string, Record<string, TableSchema>>();
	if (config.tools) {
		for (const [toolName, toolConfig] of Object.entries(config.tools)) {
			try {
				const schemaData = (await resolveSource(
					toolConfig.schema,
					workspaceRoot,
				)) as any;
				if (schemaData && schemaData.table_schemas) {
					toolSchemas.set(toolName, schemaData.table_schemas);
				}
			} catch (_) {}
		}
	}

	const pinnedSchemas = new Map<string, TableSchema>();
	const threshold = config.auto_compression?.filter_chain_threshold ?? 20;

	return new FilterStore(
		adapter.sessionFilter!,
		adapter.persistentFilter!,
		toolSchemas,
		pinnedSchemas,
		threshold,
	);
}

export async function getObjectStore(
	config: MiddlewareConfig,
	workspaceRoot: string,
): Promise<ObjectStore> {
	const adapter = await createRepo(toRepoConfig(config, workspaceRoot));

	const objectSchemas = new Map<string, any>();
	const validationEngines = new Map<string, any>();
	if (config.object_schemas) {
		for (const [schemaName, entry] of Object.entries(config.object_schemas)) {
			try {
				const locator = (entry as any).schema ?? entry;
				const schemaData = await resolveSource(locator, workspaceRoot);
				objectSchemas.set(schemaName, schemaData);
				if ((entry as any).validation_engine) {
					validationEngines.set(schemaName, (entry as any).validation_engine);
				}
			} catch (_) {}
		}
	}

	const limits = config.object_schema_limits;
	const threshold = config.auto_compression?.object_chain_threshold ?? 15;

	return new ObjectStore(
		adapter.sessionObject!,
		adapter.persistentObject!,
		objectSchemas,
		limits?.max_fields_per_def ?? 7,
		limits?.max_ref_depth ?? 5,
		threshold,
		validationEngines,
		workspaceRoot,
	);
}

export async function getFormStore(
	config: MiddlewareConfig,
	workspaceRoot: string,
): Promise<FormStore> {
	const adapter = await createRepo(toRepoConfig(config, workspaceRoot));

	const formSchemas = new Map<string, FormSchema>();
	if (config.form_schemas) {
		for (const [schemaName, entry] of Object.entries(config.form_schemas)) {
			try {
				const locator = (entry as any).schema ?? entry;
				const schema = (await resolveSource(
					locator,
					workspaceRoot,
				)) as FormSchema;
				formSchemas.set(schemaName, schema);
			} catch (err: any) {
				console.error(
					`Failed to load form schema "${schemaName}":`,
					err.message || err,
				);
			}
		}
	}

	return new FormStore(
		adapter.sessionForm!,
		adapter.persistentForm!,
		formSchemas,
	);
}

export async function getEventStore(
	config: MiddlewareConfig,
	workspaceRoot: string,
): Promise<EventStore> {
	const adapter = await createRepo(toRepoConfig(config, workspaceRoot));

	const objectSchemas = new Map<string, any>();
	const validationEngines = new Map<string, any>();
	if (config.object_schemas) {
		for (const [schemaName, entry] of Object.entries(config.object_schemas)) {
			try {
				const locator = (entry as any).schema ?? entry;
				const schemaData = (await resolveSource(locator, workspaceRoot)) as any;
				objectSchemas.set(schemaName, schemaData);
				if ((entry as any).validation_engine) {
					validationEngines.set(schemaName, (entry as any).validation_engine);
				}
			} catch (_) {}
		}
	}

	const threshold = config.auto_compression?.object_chain_threshold ?? 15;

	return new EventStore(
		adapter.sessionEvent!,
		adapter.persistentEvent!,
		objectSchemas,
		threshold,
		validationEngines,
		workspaceRoot,
	);
}

import type { VariableService } from "@stateful-mcp/core/src/middleware/variable/types";

let globalVariableStore: VariableService | undefined;

export function getVariableStore(): VariableService | undefined {
	return globalVariableStore;
}

export function setVariableStore(store: VariableService): void {
	globalVariableStore = store;
}
