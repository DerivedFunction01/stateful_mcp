import type {
	ProjectConfigurationDto,
	ProjectConfigurationEditDto,
} from "@stateful-mcp/macro-protocol";

export interface ProjectUpdateConfigurationRequest {
	readonly configuration: ProjectConfigurationEditDto;
	readonly expectedRevision: string;
	readonly unsupportedFields?: readonly string[];
}

function isBackendDescriptor(
	value: unknown,
): value is ProjectConfigurationDto["backend"] {
	if (typeof value !== "object" || value === null) return false;
	const candidate = value as Record<string, unknown>;
	return (
		(candidate.kind === "jsonl" || candidate.kind === "sqlite") &&
		typeof candidate.path === "string"
	);
}

/**
 * Runtime guard for the project.updateConfiguration host operation. Replaces
 * the previous `payload as never` cast with an explicit, validated projection.
 */
export function parseProjectUpdateConfiguration(
	value: unknown,
): ProjectUpdateConfigurationRequest | undefined {
	if (typeof value !== "object" || value === null) return undefined;
	const candidate = value as Record<string, unknown>;
	if (candidate.operation !== "project.updateConfiguration") return undefined;
	if (typeof candidate.expectedRevision !== "string") return undefined;
	const configuration = candidate.configuration;
	if (!isProjectConfigurationDto(configuration)) return undefined;
	const unsupportedFields = [
		"extensionGroups",
		"activeExtensionGroupId",
	].filter((field) => Object.hasOwn(configuration, field));
	const {
		extensionGroups: _extensionGroups,
		activeExtensionGroupId: _activeExtensionGroupId,
		...editableConfiguration
	} = configuration;
	return {
		configuration: editableConfiguration,
		expectedRevision: candidate.expectedRevision,
		...(unsupportedFields.length ? { unsupportedFields } : {}),
	};
}

export function parsePreviewBackendMigration(
	value: unknown,
): { readonly target: ProjectConfigurationDto["backend"] } | undefined {
	if (typeof value !== "object" || value === null) return undefined;
	const candidate = value as Record<string, unknown>;
	if (candidate.operation !== "project.previewBackendMigration")
		return undefined;
	if (!isBackendDescriptor(candidate.target)) return undefined;
	return { target: candidate.target };
}

export function parseApplyBackendMigration(value: unknown):
	| {
			readonly target: ProjectConfigurationDto["backend"];
			readonly expectedRevision: string;
	  }
	| undefined {
	if (typeof value !== "object" || value === null) return undefined;
	const candidate = value as Record<string, unknown>;
	if (candidate.operation !== "project.applyBackendMigration") return undefined;
	if (typeof candidate.expectedRevision !== "string") return undefined;
	if (!isBackendDescriptor(candidate.target)) return undefined;
	return {
		target: candidate.target,
		expectedRevision: candidate.expectedRevision,
	};
}

/** Guard for the side-effect-free `project.getMigrationJournal` operation. */
export function parseGetMigrationJournal(
	value: unknown,
): { readonly operation: "project.getMigrationJournal" } | undefined {
	if (typeof value !== "object" || value === null) return undefined;
	const candidate = value as Record<string, unknown>;
	if (candidate.operation !== "project.getMigrationJournal") return undefined;
	return { operation: "project.getMigrationJournal" };
}

/** Guard for the `project.discardBackendMigration` operation. */
export function parseDiscardBackendMigration(
	value: unknown,
): { readonly operation: "project.discardBackendMigration" } | undefined {
	if (typeof value !== "object" || value === null) return undefined;
	const candidate = value as Record<string, unknown>;
	if (candidate.operation !== "project.discardBackendMigration")
		return undefined;
	return { operation: "project.discardBackendMigration" };
}

/** Guard for the `project.resumeBackendMigration` operation. */
export function parseResumeBackendMigration(
	value: unknown,
): { readonly operation: "project.resumeBackendMigration" } | undefined {
	if (typeof value !== "object" || value === null) return undefined;
	const candidate = value as Record<string, unknown>;
	if (candidate.operation !== "project.resumeBackendMigration")
		return undefined;
	return { operation: "project.resumeBackendMigration" };
}

export interface ProjectPathPayload {
	readonly parentPath: string;
	readonly name: string;
}

/**
 * Runtime guard for the project file/directory creation host operations.
 */
export function parseProjectPathPayload(
	value: unknown,
): ProjectPathPayload | undefined {
	if (typeof value !== "object" || value === null) return undefined;
	const candidate = value as Record<string, unknown>;
	if (typeof candidate.parentPath !== "string" || !candidate.parentPath)
		return undefined;
	if (typeof candidate.name !== "string") return undefined;
	return { parentPath: candidate.parentPath, name: candidate.name };
}

export interface ProjectRenamePayload {
	readonly source: string;
	readonly destination: string;
}

/**
 * Runtime guard for the project rename host operation.
 */
export function parseProjectRenamePayload(
	value: unknown,
): ProjectRenamePayload | undefined {
	if (typeof value !== "object" || value === null) return undefined;
	const candidate = value as Record<string, unknown>;
	if (typeof candidate.source !== "string" || !candidate.source)
		return undefined;
	if (typeof candidate.destination !== "string" || !candidate.destination)
		return undefined;
	return { source: candidate.source, destination: candidate.destination };
}

export interface ProjectDeletePayload {
	readonly path: string;
}

/**
 * Runtime guard for the project delete host operation.
 */
export function parseProjectDeletePayload(
	value: unknown,
): ProjectDeletePayload | undefined {
	if (typeof value !== "object" || value === null) return undefined;
	const candidate = value as Record<string, unknown>;
	if (typeof candidate.path !== "string" || !candidate.path) return undefined;
	return { path: candidate.path };
}

export interface ProjectActionRequest {
	readonly operation?:
		| "project.getConfiguration"
		| "project.updateConfiguration"
		| "project.previewBackendMigration"
		| "project.applyBackendMigration"
		| "project.recoverBackendMigration"
		| "project.getMigrationJournal"
		| "project.discardBackendMigration"
		| "project.resumeBackendMigration"
		| "project.previewExtensionGroup"
		| "project.updateExtensionGroup"
		| "project.createExtensionGroup"
		| "project.duplicateExtensionGroup"
		| "project.deleteExtensionGroup"
		| "project.setActiveExtensionGroup";
	readonly action?: "open" | "init" | "saveAs" | "close";
	readonly path?: string;
	readonly displayName?: string;
}

/**
 * Runtime guard for the generic project host operation envelope. Validates the
 * optional discriminator fields so the handler can branch on typed values
 * instead of an `as` cast.
 */
export function parseProjectAction(
	value: unknown,
): ProjectActionRequest | undefined {
	if (typeof value !== "object" || value === null) return undefined;
	const candidate = value as Record<string, unknown>;
	if (
		candidate.operation !== undefined &&
		typeof candidate.operation !== "string"
	)
		return undefined;
	const action = candidate.action;
	if (
		action !== undefined &&
		!["open", "init", "saveAs", "close"].includes(action as string)
	)
		return undefined;
	if (candidate.path !== undefined && typeof candidate.path !== "string")
		return undefined;
	if (
		candidate.displayName !== undefined &&
		typeof candidate.displayName !== "string"
	)
		return undefined;
	return {
		operation: candidate.operation as ProjectActionRequest["operation"],
		action: candidate.action as ProjectActionRequest["action"],
		path: candidate.path as string | undefined,
		displayName: candidate.displayName as string | undefined,
	};
}

/**
 * Structural runtime guard for a ProjectConfigurationDto. Used to validate
 * host-boundary input before it is trusted as a typed projection.
 */
export function isProjectConfigurationDto(
	value: unknown,
): value is ProjectConfigurationDto {
	if (typeof value !== "object" || value === null) return false;
	const candidate = value as Record<string, unknown>;
	if (typeof candidate.formatVersion !== "number") return false;
	if (typeof candidate.projectId !== "string") return false;
	if (typeof candidate.displayName !== "string") return false;
	if (!isBackendDescriptor(candidate.backend)) return false;
	if (!Array.isArray(candidate.extensions)) return false;
	if (!Array.isArray(candidate.resources)) return false;
	if (!Array.isArray(candidate.historyResources)) return false;
	if (typeof candidate.revision !== "string") return false;
	if (
		candidate.activeExtensionGroupId !== undefined &&
		typeof candidate.activeExtensionGroupId !== "string"
	)
		return false;
	if (
		candidate.uiLocale !== undefined &&
		typeof candidate.uiLocale !== "string"
	)
		return false;
	if (candidate.extensionGroups !== undefined) {
		if (
			typeof candidate.extensionGroups !== "object" ||
			candidate.extensionGroups === null ||
			Array.isArray(candidate.extensionGroups)
		)
			return false;
		for (const [key, group] of Object.entries(
			candidate.extensionGroups as Record<string, unknown>,
		)) {
			if (typeof group !== "object" || group === null) return false;
			const entry = group as Record<string, unknown>;
			if (entry.id !== key) return false;
			if (typeof entry.displayName !== "string") return false;
			if (!Array.isArray(entry.extensionIds)) return false;
			if (entry.extensionIds.some((id) => typeof id !== "string")) return false;
			if (
				entry.source !== "project" &&
				entry.source !== "builtin" &&
				entry.source !== "extension"
			)
				return false;
			if (entry.readOnly !== undefined && typeof entry.readOnly !== "boolean")
				return false;
			if (
				entry.description !== undefined &&
				typeof entry.description !== "string"
			)
				return false;
		}
	}
	if (candidate.projectSettings !== undefined)
		if (
			typeof candidate.projectSettings !== "object" ||
			candidate.projectSettings === null
		)
			return false;
	if (candidate.templates !== undefined && !Array.isArray(candidate.templates))
		return false;
	if (
		candidate.projectSettingsContributions !== undefined &&
		!Array.isArray(candidate.projectSettingsContributions)
	)
		return false;
	if (
		candidate.availableLocales !== undefined &&
		!Array.isArray(candidate.availableLocales)
	)
		return false;
	return true;
}
