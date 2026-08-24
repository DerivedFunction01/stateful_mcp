import type {
	ProjectConfigurationDto,
	ProjectSettingsContributionDto,
} from "@stateful-mcp/macro-protocol";

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

/**
 * Validate a project configuration edit against host-boundary invariants.
 *
 * Returns a list of human-readable problems. An empty list means the
 * configuration is acceptable for persistence. Only fields that are practical
 * to validate at the boundary are checked: the active extension profile, the
 * membership of each profile, the UI locale, and project settings that have a
 * matching contribution schema.
 */
export function validateProjectConfiguration(
	config: ProjectConfigurationDto,
	availableLocales: readonly { readonly id: string }[],
	contributions: readonly ProjectSettingsContributionDto[],
): readonly string[] {
	const errors: string[] = [];

	if (config.activeExtensionProfileId !== undefined) {
		const profiles = config.extensionProfiles ?? {};
		if (!(config.activeExtensionProfileId in profiles)) {
			errors.push(
				`Active extension profile '${config.activeExtensionProfileId}' is not defined in extensionProfiles`,
			);
		}
	}

	const knownExtensions = new Set(
		config.extensions.map((extension) => extension.id),
	);
	for (const [profileId, members] of Object.entries(
		config.extensionProfiles ?? {},
	)) {
		for (const memberId of members) {
			if (!knownExtensions.has(memberId)) {
				errors.push(
					`Extension profile '${profileId}' references unknown extension '${memberId}'`,
				);
			}
		}
	}

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

	return errors;
}
