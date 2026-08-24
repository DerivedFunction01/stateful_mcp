import {
	type ProjectExtensionGroupDiagnostic,
	validateProjectExtensionGroups,
} from "@stateful-mcp/macro";
import type {
	ProjectConfigurationDto,
	ProjectExtensionGroupDiagnosticDto,
	ProjectSettingsContributionDto,
} from "@stateful-mcp/macro-protocol";
import {
	toProjectExtensionGroupDiagnosticDto,
	toResolverExtensions,
} from "./project-extension-groups";

type SettingSchemaEntry = ProjectSettingsContributionDto["schema"][number];

function validateSettingValue(
	entry: SettingSchemaEntry,
	value: unknown,
): string | undefined {
	switch (entry.type) {
		case "boolean":
			return typeof value === "boolean" ? undefined : "must be a boolean";
		case "number":
			return typeof value === "number" && Number.isFinite(value)
				? undefined
				: "must be a finite number";
		case "string":
			return typeof value === "string" ? undefined : "must be a string";
		case "enum":
			if (typeof value !== "string") return "must be a string enum value";
			if (
				entry.enumOptions &&
				!entry.enumOptions.some((option) => option.id === value)
			)
				return `must be one of: ${entry.enumOptions
					.map((option) => option.id)
					.join(", ")}`;
			return undefined;
		case "array":
			return Array.isArray(value) ? undefined : "must be an array";
		case "object":
		case "json":
		case "keymap":
			return typeof value === "object" && value !== null
				? undefined
				: "must be an object";
		default:
			return undefined;
	}
}

export interface ProjectConfigurationValidation {
	/** Human-readable problems. Empty means the edit may be persisted. */
	readonly errors: readonly string[];
	/**
	 * Structured Extension Activation Group diagnostics with stable codes, so
	 * callers can render them per group or per extension instead of parsing a
	 * concatenated message.
	 */
	readonly groupDiagnostics: readonly ProjectExtensionGroupDiagnosticDto[];
}

/**
 * Validate a project configuration edit against host-boundary invariants.
 *
 * Checks the fields that are practical to validate at the boundary: the
 * Extension Activation Groups (record key/id agreement, display names,
 * membership, dependency closure, active group), the UI locale, and project
 * settings that have a matching contribution schema.
 */
export function validateProjectConfigurationDetailed(
	config: ProjectConfigurationDto,
	availableLocales: readonly { readonly id: string }[],
	contributions: readonly ProjectSettingsContributionDto[],
	reservedGroupIds: readonly string[] = [],
): ProjectConfigurationValidation {
	const errors: string[] = [];
	const groupDiagnostics: ProjectExtensionGroupDiagnostic[] = [
		...validateProjectExtensionGroups({
			extensions: toResolverExtensions(config.extensions),
			reservedGroupIds,
			...(config.extensionGroups ? { groups: config.extensionGroups } : {}),
			...(config.activeExtensionGroupId === undefined
				? {}
				: { activeGroupId: config.activeExtensionGroupId }),
		}),
	];
	for (const diagnostic of groupDiagnostics)
		if (diagnostic.severity === "error") errors.push(diagnostic.message);

	if (config.uiLocale !== undefined) {
		const availableIds = new Set(availableLocales.map((locale) => locale.id));
		if (!availableIds.has(config.uiLocale)) {
			errors.push(`Locale '${config.uiLocale}' is not an available locale`);
		}
	}

	if (config.projectSettings) {
		for (const contribution of contributions) {
			const namespaceValues = config.projectSettings[contribution.namespace];
			if (!namespaceValues) continue;
			for (const entry of contribution.schema) {
				const key = entry.path.join(".");
				if (!(key in namespaceValues)) continue;
				const typeError = validateSettingValue(entry, namespaceValues[key]);
				if (typeError) {
					errors.push(
						`Project setting '${contribution.namespace}.${key}' ${typeError}`,
					);
				}
			}
		}
	}

	return {
		errors,
		groupDiagnostics: groupDiagnostics.map(
			toProjectExtensionGroupDiagnosticDto,
		),
	};
}

/**
 * Human-readable projection of {@link validateProjectConfigurationDetailed}.
 * An empty list means the configuration is acceptable for persistence.
 */
export function validateProjectConfiguration(
	config: ProjectConfigurationDto,
	availableLocales: readonly { readonly id: string }[],
	contributions: readonly ProjectSettingsContributionDto[],
	reservedGroupIds: readonly string[] = [],
): readonly string[] {
	return validateProjectConfigurationDetailed(
		config,
		availableLocales,
		contributions,
		reservedGroupIds,
	).errors;
}
