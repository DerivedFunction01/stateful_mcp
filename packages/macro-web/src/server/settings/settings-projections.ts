import type { SettingsPreviewResult } from "@stateful-mcp/macro";
import type {
	SettingsBundlePayload,
	SettingsDiagnostic,
	SettingsSchemaEntry,
} from "@stateful-mcp/macro/workspace/config/settings-service";
import {
	SETTINGS_REDACTION_MARKER,
	type SettingsBundleDto,
	type SettingsDiagnosticDto,
	type SettingsPreviewDto,
	type SettingsScope,
	type SettingsUiSnapshotDto,
} from "@stateful-mcp/macro-protocol";

export function toSettingsBundleDto(
	bundle: SettingsBundlePayload,
): SettingsBundleDto {
	return {
		$schema: bundle.$schema,
		version: bundle.version,
		exportedAt: bundle.exportedAt,
		workspace: bundle.workspace ? { ...bundle.workspace } : undefined,
		profiles: bundle.profiles
			? Object.fromEntries(
					Object.entries(bundle.profiles).map(([id, profile]) => [
						id,
						{ ...profile },
					]),
				)
			: undefined,
		extensions: bundle.extensions
			? Object.fromEntries(
					Object.entries(bundle.extensions).map(([id, config]) => [
						id,
						{ ...config },
					]),
				)
			: undefined,
	};
}

export function isSettingsBundleDto(
	value: unknown,
): value is SettingsBundleDto {
	if (!value || typeof value !== "object" || Array.isArray(value)) return false;
	const bundle = value as Record<string, unknown>;
	if (bundle.version !== 1 || typeof bundle.exportedAt !== "string")
		return false;
	for (const key of ["workspace", "profiles", "extensions"]) {
		const section = bundle[key];
		if (
			section !== undefined &&
			(!section || typeof section !== "object" || Array.isArray(section))
		)
			return false;
	}
	return true;
}

export function fromSettingsBundleDto(
	bundle: SettingsBundleDto,
): SettingsBundlePayload {
	return {
		$schema: bundle.$schema,
		version: bundle.version,
		exportedAt: bundle.exportedAt,
		workspace: bundle.workspace ? { ...bundle.workspace } : undefined,
		profiles: bundle.profiles
			? Object.fromEntries(
					Object.entries(bundle.profiles).map(([id, profile]) => [
						id,
						{ ...profile },
					]),
				)
			: undefined,
		extensions: bundle.extensions
			? Object.fromEntries(
					Object.entries(bundle.extensions).map(([id, config]) => [
						id,
						{ ...config },
					]),
				)
			: undefined,
	};
}

export function toSettingsDiagnosticDto(
	diagnostic: SettingsDiagnostic,
): SettingsDiagnosticDto {
	return {
		severity: diagnostic.severity,
		code: diagnostic.code,
		path: diagnostic.path,
		/**
		 * The DTO is a strict structured descriptor: it carries only
		 * `messageKey`, never a human-readable `message`. The canonical
		 * `SettingsDiagnostic` does not yet project a structured key, so use its
		 * `code` (a structured identifier) and fall back to a generic key when
		 * absent.
		 */
		messageKey: diagnostic.code ?? "settings.diagnostic.generic",
		line: diagnostic.line,
		column: diagnostic.column,
		restartRequired: diagnostic.restartRequired,
	};
}

export function toSettingsPreviewDto(
	preview: SettingsPreviewResult,
): SettingsPreviewDto {
	return {
		requestId: preview.requestId,
		settingsRevision: preview.settingsRevision,
		providerId: preview.providerId,
		status: preview.status,
		diagnostics: preview.diagnostics.map(toSettingsDiagnosticDto),
		tokenDescriptors: preview.tokenDescriptors,
		templateAnalysis: preview.templateAnalysis?.map((analysis) => ({
			template: analysis.template,
			tokens: analysis.tokens,
			segments: analysis.segments,
			unknownTokens: analysis.unknownTokens,
		})),
		sample: preview.sample,
	};
}

/**
 * Replaces sensitive values in a bundle DTO with the protocol redaction marker,
 * using the settings schema to locate sensitive paths in each section.
 */
export function redactSensitiveBundle(
	bundle: SettingsBundleDto,
	schema: readonly SettingsSchemaEntry[],
): SettingsBundleDto {
	const result = structuredClone(bundle);
	const redact = (
		value: Record<string, unknown> | undefined,
		entries: readonly SettingsSchemaEntry[],
	) => {
		if (!value) return;
		for (const entry of entries) {
			if (entry.sensitive && hasBundlePath(value, entry.path))
				setBundlePath(value, entry.path, SETTINGS_REDACTION_MARKER);
		}
	};
	redact(result.workspace, sectionSchema(schema, "workspace"));
	for (const [id, profile] of Object.entries(result.profiles ?? {}))
		redact(profile, sectionSchema(schema, "profile", id));
	for (const [id, extension] of Object.entries(result.extensions ?? {}))
		redact(extension, sectionSchema(schema, "extension", id));
	return result;
}

/**
 * Validates and sanitizes an imported bundle for a single target profile.
 * Drops sensitive paths (with a warning) and reports type/path diagnostics.
 */
export function prepareImportedBundle(
	bundle: SettingsBundleDto,
	profileId: string,
	schema: readonly SettingsSchemaEntry[],
	messageForKey: (
		key: string,
		params?: Readonly<Record<string, string | number>>,
	) => string = (key) => key,
): {
	bundle: SettingsBundleDto;
	diagnostics: readonly SettingsDiagnosticDto[];
} {
	const result = structuredClone(bundle);
	const diagnostics: SettingsDiagnosticDto[] = [];
	const profileIds = Object.keys(result.profiles ?? {});
	for (const importedProfileId of profileIds) {
		if (importedProfileId !== profileId) {
			diagnostics.push({
				severity: "error",
				messageKey: "settings.bundle.profileOutsideSelection",
				messageParams: { profile: importedProfileId },
			});
		}
	}
	const sanitize = (
		value: Record<string, unknown> | undefined,
		entries: readonly SettingsSchemaEntry[],
	) => {
		if (!value) return;
		for (const entry of entries) {
			if (!hasBundlePath(value, entry.path)) continue;
			if (entry.sensitive) {
				diagnostics.push({
					severity: "warning",
					path: entry.path,
					messageKey: "settings.bundle.sensitiveOmitted",
				});
				deleteBundlePath(value, entry.path);
				continue;
			}
			const current = getBundlePath(value, entry.path);
			if (!matchesSettingsType(current, entry))
				diagnostics.push({
					severity: "error",
					path: entry.path,
					messageKey: "settings.bundle.valueInvalid",
					messageParams: { path: entry.path.join(".") },
				});
		}
	};
	sanitize(result.workspace, sectionSchema(schema, "workspace"));
	for (const [id, profile] of Object.entries(result.profiles ?? {}))
		sanitize(profile, sectionSchema(schema, "profile", id));
	for (const [id, extension] of Object.entries(result.extensions ?? {}))
		sanitize(extension, sectionSchema(schema, "extension", id));
	return { bundle: result, diagnostics };
}

function sectionSchema(
	schema: readonly SettingsSchemaEntry[],
	section: "workspace" | "profile" | "extension",
	id?: string,
): readonly SettingsSchemaEntry[] {
	return schema.flatMap((entry) => {
		const prefix =
			section === "extension"
				? ["extensions", id]
				: section === "profile"
					? ["profiles", id]
					: [];
		if (prefix.length === 0)
			return entry.path[0] === "extensions" || entry.path[0] === "profiles"
				? []
				: [entry];
		if (
			entry.path
				.slice(0, prefix.length)
				.every((part, index) => part === prefix[index])
		)
			return [{ ...entry, path: entry.path.slice(prefix.length) }];
		return [];
	});
}

function setBundlePath(
	root: Record<string, unknown>,
	path: readonly string[],
	value: unknown,
): void {
	let current = root;
	for (const key of path.slice(0, -1)) {
		const child = current[key];
		if (!child || typeof child !== "object" || Array.isArray(child))
			current[key] = {};
		current = current[key] as Record<string, unknown>;
	}
	if (path.length > 0) current[path[path.length - 1]!] = value;
}

function getBundlePath(
	root: Record<string, unknown>,
	path: readonly string[],
): unknown {
	return path.reduce<unknown>((value, key) => {
		if (!value || typeof value !== "object" || Array.isArray(value))
			return undefined;
		return (value as Record<string, unknown>)[key];
	}, root);
}

function hasBundlePath(
	root: Record<string, unknown>,
	path: readonly string[],
): boolean {
	return path.length > 0 && getBundlePath(root, path) !== undefined;
}

function deleteBundlePath(
	root: Record<string, unknown>,
	path: readonly string[],
): void {
	const parent = getBundlePath(root, path.slice(0, -1));
	if (parent && typeof parent === "object" && !Array.isArray(parent))
		delete (parent as Record<string, unknown>)[path[path.length - 1]!];
}

function matchesSettingsType(
	value: unknown,
	entry: SettingsSchemaEntry,
): boolean {
	if (entry.type === "json") return true;
	if (entry.type === "boolean") return typeof value === "boolean";
	if (entry.type === "number")
		return typeof value === "number" && Number.isFinite(value);
	if (entry.type === "string") return typeof value === "string";
	if (entry.type === "enum")
		return (
			typeof value === "string" &&
			(!entry.enumValues || entry.enumValues.includes(value))
		);
	if (entry.type === "array") return Array.isArray(value);
	if (entry.type === "object")
		return Boolean(value) && typeof value === "object" && !Array.isArray(value);
	return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function emptySettingsSnapshot(
	activeProfileId: string,
	supportedScopes: readonly SettingsScope[],
): SettingsUiSnapshotDto {
	return {
		activeProfileId,
		availableProfiles: [],
		activeScope: "workspace",
		supportedScopes: [...supportedScopes],
		searchQuery: "",
		filterModifiedOnly: false,
		isSplitJsonMode: false,
		jsonModeAvailable: true,
		modifiedCount: 0,
		totalModifiedCount: 0,
		sections: [],
		rawJsonText: "{}",
		hasErrors: false,
		settingsRevision: "",
	};
}
