import { validateProjectExtensionGroups } from "@stateful-mcp/macro";
import type {
	MessageParam,
	ProjectConfigurationDto,
	ProjectExtensionGroupDiagnosticDto,
	ProjectSettingsContributionDto,
} from "@stateful-mcp/macro-protocol";
import {
	toProjectExtensionGroupDiagnosticDto,
	toResolverExtensions,
} from "./project-extension-groups";

type SettingSchemaEntry = ProjectSettingsContributionDto["schema"][number];

interface SettingTypeKey {
	readonly messageKey: string;
	readonly expected: string;
}

function settingTypeKey(entry: SettingSchemaEntry): SettingTypeKey | undefined {
	switch (entry.type) {
		case "boolean":
			return {
				messageKey: "project.configuration.settingType.boolean",
				expected: "boolean",
			};
		case "number":
			return {
				messageKey: "project.configuration.settingType.number",
				expected: "number",
			};
		case "string":
			return {
				messageKey: "project.configuration.settingType.string",
				expected: "string",
			};
		case "enum":
			return {
				messageKey: "project.configuration.settingType.enum",
				expected: "enum",
			};
		case "array":
			return {
				messageKey: "project.configuration.settingType.array",
				expected: "array",
			};
		case "object":
		case "json":
		case "keymap":
			return {
				messageKey: "project.configuration.settingType.object",
				expected: "object",
			};
		default:
			return undefined;
	}
}

function isValidSettingValue(
	entry: SettingSchemaEntry,
	value: unknown,
): boolean {
	switch (entry.type) {
		case "boolean":
			return typeof value === "boolean";
		case "number":
			return typeof value === "number" && Number.isFinite(value);
		case "string":
			return typeof value === "string";
		case "enum":
			if (typeof value !== "string") return false;
			return (
				!entry.enumOptions ||
				entry.enumOptions.some((option) => option.id === value)
			);
		case "array":
			return Array.isArray(value);
		case "object":
		case "json":
		case "keymap":
			return typeof value === "object" && value !== null;
		default:
			return true;
	}
}

/**
 * Validates one setting value against its schema entry and returns a structured
 * diagnostic (code + i18n key + safe params) when it fails. Never returns
 * English prose; enum option ids are passed as a `options` param, not embedded
 * in a message.
 */
export function validateSettingValue(
	entry: SettingSchemaEntry,
	value: unknown,
	namespace: string,
): ProjectExtensionGroupDiagnosticDto | undefined {
	const type = settingTypeKey(entry);
	if (!type) return undefined;
	if (isValidSettingValue(entry, value)) return undefined;
	const messageParams: Record<string, MessageParam> = {
		namespace,
		path: entry.path.join("."),
	};
	if (entry.type === "enum" && entry.enumOptions) {
		messageParams.options = entry.enumOptions
			.map((option) => option.id)
			.join(", ");
	} else {
		messageParams.expected = type.expected;
	}
	return {
		code: "project.configuration.settingType",
		severity: "error",
		messageKey: type.messageKey,
		messageParams,
	};
}

export interface ProjectConfigurationValidation {
	/**
	 * Structured Extension Activation Group diagnostics with stable codes, so
	 * callers can render them per group or per extension instead of parsing a
	 * concatenated message.
	 */
	readonly groupDiagnostics: readonly ProjectExtensionGroupDiagnosticDto[];
	/**
	 * Structured configuration diagnostics (locale and setting validation)
	 * with stable i18n keys and safe params. Never English prose.
	 */
	readonly diagnostics: readonly ProjectExtensionGroupDiagnosticDto[];
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
	const groupDiagnostics: ProjectExtensionGroupDiagnosticDto[] =
		validateProjectExtensionGroups({
			extensions: toResolverExtensions(config.extensions),
			reservedGroupIds,
			...(config.extensionGroups ? { groups: config.extensionGroups } : {}),
			...(config.activeExtensionGroupId === undefined
				? {}
				: { activeGroupId: config.activeExtensionGroupId }),
		}).map(toProjectExtensionGroupDiagnosticDto);
	const diagnostics: ProjectExtensionGroupDiagnosticDto[] = [];

	if (config.uiLocale !== undefined) {
		const availableIds = new Set(availableLocales.map((locale) => locale.id));
		if (!availableIds.has(config.uiLocale)) {
			diagnostics.push({
				code: "project.configuration.localeUnavailable",
				severity: "error",
				messageKey: "project.configuration.localeUnavailable",
				messageParams: { locale: config.uiLocale },
			});
		}
	}

	if (config.projectSettings) {
		for (const contribution of contributions) {
			const namespaceValues = config.projectSettings[contribution.namespace];
			if (!namespaceValues) continue;
			for (const entry of contribution.schema) {
				const key = entry.path.join(".");
				if (!(key in namespaceValues)) continue;
				const failure = validateSettingValue(
					entry,
					namespaceValues[key],
					contribution.namespace,
				);
				if (failure) diagnostics.push(failure);
			}
		}
	}

	return { groupDiagnostics, diagnostics };
}

/**
 * Structured projection of {@link validateProjectConfigurationDetailed}. An
 * object with no error-severity diagnostics means the configuration is
 * acceptable for persistence.
 */
export function validateProjectConfiguration(
	config: ProjectConfigurationDto,
	availableLocales: readonly { readonly id: string }[],
	contributions: readonly ProjectSettingsContributionDto[],
	reservedGroupIds: readonly string[] = [],
): ProjectConfigurationValidation {
	return validateProjectConfigurationDetailed(
		config,
		availableLocales,
		contributions,
		reservedGroupIds,
	);
}
