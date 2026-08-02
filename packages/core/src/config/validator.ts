import type { StoreBinding, StoreRoute } from "../storage/contracts";
import type { MiddlewareConfig, StorageRuntimeConfig } from "./types";

function validateLocator(locator: any, context: string): void {
	if (!locator || typeof locator !== "object") {
		throw new Error(
			`Validation Error: ${context} must be a valid ResourceLocator object.`,
		);
	}

	const { _type } = locator;
	if (!_type || !["adapter", "file", "remote_url"].includes(_type)) {
		throw new Error(
			`Validation Error: ${context} has invalid or missing _type "${_type}". Must be "adapter", "file", or "remote_url".`,
		);
	}

	if (_type === "adapter") {
		if (typeof locator.name !== "string" || !locator.name) {
			throw new Error(
				`Validation Error: ${context} is an adapter but is missing a valid "name".`,
			);
		}
	} else if (_type === "file") {
		if (typeof locator.path !== "string" || !locator.path) {
			throw new Error(
				`Validation Error: ${context} is a file locator but is missing a valid "path".`,
			);
		}
	} else if (_type === "remote_url") {
		if (typeof locator.url !== "string" || !locator.url) {
			throw new Error(
				`Validation Error: ${context} is a remote_url locator but is missing a valid "url".`,
			);
		}
	}
}

const bindingRoles = new Set([
	"source",
	"projection",
	"cache",
	"fallback",
	"backup",
]);
const permissionCapabilities: Record<string, string> = {
	read: "read",
	write: "write",
	delete: "delete",
	syncRead: "incrementalChanges",
	syncWrite: "incrementalChanges",
	export: "read",
	import: "write",
};

function validateBinding(binding: StoreBinding, context: string): void {
	if (!binding || typeof binding !== "object")
		throw new Error(`Validation Error: ${context} must be a store binding.`);
	validateLocator(binding.locator, `${context}.locator`);
	if (!bindingRoles.has(binding.role))
		throw new Error(`Validation Error: ${context}.role is invalid.`);
	if (
		binding.freshnessTtlMs !== undefined &&
		(!Number.isFinite(binding.freshnessTtlMs) || binding.freshnessTtlMs < 0)
	) {
		throw new Error(
			`Validation Error: ${context}.freshnessTtlMs must be a non-negative number.`,
		);
	}
	for (const [permission, capability] of Object.entries(
		permissionCapabilities,
	)) {
		if (
			binding.permissions?.[permission as keyof typeof binding.permissions] &&
			binding.capabilities?.[
				capability as keyof typeof binding.capabilities
			] === false
		) {
			throw new Error(
				`Validation Error: ${context}.permissions.${permission} exceeds capabilities.${capability}.`,
			);
		}
	}
	if (
		binding.role === "source" &&
		binding.permissions?.write &&
		binding.authority === "authoritative"
	) {
		throw new Error(
			`Validation Error: ${context} authoritative sources cannot grant writes.`,
		);
	}
}

function validateRoute(route: StoreRoute | undefined, context: string): void {
	if (!route) return;
	for (const [name, binding] of Object.entries(route)) {
		if (Array.isArray(binding))
			binding.forEach((item, index) =>
				validateBinding(item, `${context}.${name}[${index}]`),
			);
		else if (binding) validateBinding(binding, `${context}.${name}`);
	}
}

export function validateStorageRuntimeConfig(
	config: unknown,
): asserts config is StorageRuntimeConfig {
	if (!config || typeof config !== "object")
		throw new Error("Validation Error: storage_runtime must be an object.");
	const value = config as StorageRuntimeConfig;
	for (const [domain, routes] of Object.entries(value)) {
		if (!routes || typeof routes !== "object")
			throw new Error(
				`Validation Error: storage_runtime.${domain} must be an object.`,
			);
		const section = routes as any;
		if (
			section.session?.ttlMs !== undefined &&
			(!Number.isFinite(section.session.ttlMs) || section.session.ttlMs <= 0)
		) {
			throw new Error(
				`Validation Error: storage_runtime.${domain}.session.ttlMs must be greater than zero.`,
			);
		}
		validateRoute(
			section.session?.route,
			`storage_runtime.${domain}.session.route`,
		);
		validateRoute(
			section.persistent?.scope?.global,
			`storage_runtime.${domain}.persistent.scope.global`,
		);
		validateRoute(
			section.persistent?.scope?.user,
			`storage_runtime.${domain}.persistent.scope.user`,
		);
	}
	const dictionary = value.dictionary;
	if (dictionary) {
		validateRoute(dictionary.concepts, "storage_runtime.dictionary.concepts");
		validateRoute(
			dictionary.expressions,
			"storage_runtime.dictionary.expressions",
		);
		validateRoute(dictionary.filters, "storage_runtime.dictionary.filters");
		if (dictionary.projection)
			validateBinding(
				dictionary.projection,
				"storage_runtime.dictionary.projection",
			);
	}
}

export function validateMiddlewareConfig(
	config: any,
): asserts config is MiddlewareConfig {
	if (!config || typeof config !== "object") {
		throw new Error(
			"Validation Error: Configuration must be a non-null object.",
		);
	}

	if (config.version !== 1) {
		throw new Error(
			`Validation Error: Unsupported config version "${config.version}". Supported version is 1.`,
		);
	}
	if (config.storage_runtime)
		validateStorageRuntimeConfig(config.storage_runtime);

	validateLocator(config.filter_session_state, "filter_session_state");

	if (
		!config.filter_persistent_state ||
		typeof config.filter_persistent_state !== "object"
	) {
		throw new Error(
			"Validation Error: filter_persistent_state must be an object.",
		);
	}
	validateLocator(
		config.filter_persistent_state.global,
		"filter_persistent_state.global",
	);
	validateLocator(
		config.filter_persistent_state.user,
		"filter_persistent_state.user",
	);

	validateLocator(config.object_session_state, "object_session_state");
	if (
		!config.object_persistent_state ||
		typeof config.object_persistent_state !== "object"
	) {
		throw new Error(
			"Validation Error: object_persistent_state must be an object.",
		);
	}
	validateLocator(
		config.object_persistent_state.global,
		"object_persistent_state.global",
	);
	validateLocator(
		config.object_persistent_state.user,
		"object_persistent_state.user",
	);

	if (config.event_session_state) {
		validateLocator(config.event_session_state, "event_session_state");
	}
	if (config.event_persistent_state) {
		if (typeof config.event_persistent_state !== "object") {
			throw new Error(
				"Validation Error: event_persistent_state must be an object.",
			);
		}
		validateLocator(
			config.event_persistent_state.global,
			"event_persistent_state.global",
		);
		validateLocator(
			config.event_persistent_state.user,
			"event_persistent_state.user",
		);
	}

	if (config.form_session_state) {
		validateLocator(config.form_session_state, "form_session_state");
	}
	if (config.form_persistent_state) {
		if (typeof config.form_persistent_state !== "object") {
			throw new Error(
				"Validation Error: form_persistent_state must be an object.",
			);
		}
		validateLocator(
			config.form_persistent_state.global,
			"form_persistent_state.global",
		);
		validateLocator(
			config.form_persistent_state.user,
			"form_persistent_state.user",
		);
	}

	validateLocator(config.dictionary_state, "dictionary_state");
	validateLocator(config.dictionary_resolver, "dictionary_resolver");

	if (config.constants) {
		if (config.constants.global) {
			validateLocator(config.constants.global, "constants.global");
		}
		if (config.constants.user) {
			validateLocator(config.constants.user, "constants.user");
		}
	}

	if (!config.tools || typeof config.tools !== "object") {
		throw new Error(
			'Validation Error: "tools" must be a valid configuration record.',
		);
	}

	for (const [toolName, toolConfig] of Object.entries<any>(config.tools)) {
		if (!toolConfig || typeof toolConfig !== "object") {
			throw new Error(
				`Validation Error: Tool "${toolName}" config must be an object.`,
			);
		}

		validateLocator(toolConfig.schema, `tools.${toolName}.schema`);

		if (!toolConfig.engine) {
			throw new Error(
				`Validation Error: Tool "${toolName}" must define an engine.`,
			);
		}

		if (toolConfig.engine._type) {
			validateLocator(toolConfig.engine, `tools.${toolName}.engine`);
		} else {
			if (typeof toolConfig.engine !== "object") {
				throw new Error(
					`Validation Error: Tool "${toolName}" engine must be a ResourceLocator or a map of tables to ResourceLocators.`,
				);
			}
			for (const tableName of Object.keys(toolConfig.engine)) {
				validateLocator(
					toolConfig.engine[tableName],
					`tools.${toolName}.engine[${tableName}]`,
				);
			}
		}

		if (toolConfig.validation_engine) {
			validateLocator(
				toolConfig.validation_engine,
				`tools.${toolName}.validation_engine`,
			);
		}
	}

	if (config.form_schemas) {
		if (typeof config.form_schemas !== "object") {
			throw new Error('Validation Error: "form_schemas" must be an object.');
		}
		for (const [schemaName, schemaObj] of Object.entries<any>(
			config.form_schemas,
		)) {
			if (!schemaObj || typeof schemaObj !== "object") {
				throw new Error(
					`Validation Error: Form schema "${schemaName}" must be an object.`,
				);
			}
			if (schemaObj._type) {
				validateLocator(schemaObj, `form_schemas.${schemaName}`);
			} else {
				if (!schemaObj.schema) {
					throw new Error(
						`Validation Error: Form schema "${schemaName}" is missing a "schema" locator.`,
					);
				}
				validateLocator(schemaObj.schema, `form_schemas.${schemaName}.schema`);
			}
		}
	}

	if (config.pagination_limits) {
		if (typeof config.pagination_limits !== "object") {
			throw new Error(
				'Validation Error: "pagination_limits" must be an object.',
			);
		}
		const pl = config.pagination_limits as Record<string, unknown>;
		const plFields = [
			"log_page_size",
			"examples_page_size",
			"merge_conflicts_page_size",
		] as const;
		for (const f of plFields) {
			if (pl[f] !== undefined) {
				if (
					typeof pl[f] !== "number" ||
					!Number.isInteger(pl[f]) ||
					(pl[f] as number) < 1
				) {
					throw new Error(
						`Validation Error: pagination_limits.${f} must be an integer ≥ 1.`,
					);
				}
			}
		}
	}

	if (config.about_and_examples) {
		if (typeof config.about_and_examples !== "object") {
			throw new Error(
				'Validation Error: "about_and_examples" must be an object.',
			);
		}
		const fields = [
			"middleware_about",
			"filter_about",
			"filter_examples",
			"object_about",
			"object_examples",
			"dictionary_about",
			"dictionary_examples",
			"event_about",
			"event_examples",
			"form_about",
			"form_examples",
		];
		for (const field of fields) {
			const locators = config.about_and_examples[field];
			if (locators) {
				if (!Array.isArray(locators)) {
					throw new Error(
						`Validation Error: about_and_examples.${field} must be an array of ResourceLocators.`,
					);
				}
				for (let i = 0; i < locators.length; i++) {
					validateLocator(locators[i], `about_and_examples.${field}[${i}]`);
				}
			}
		}
	}
}
