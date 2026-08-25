import type {
	LoadedMacroWorkspace,
	MacroProject,
} from "@stateful-mcp/macro-host";
import type {
	ProjectConfigurationDto,
	ProjectConfigurationImpact,
	ProjectOperationResult,
} from "@stateful-mcp/macro-protocol";
import { validateProjectConfiguration } from "../project-configuration-validation";
import {
	buildProjectSettingsContributions,
	toProjectConfigurationDto,
} from "./project-projections";

export interface ProjectConfigurationContext {
	readonly requireProject: () => MacroProject;
	readonly loaded: () => LoadedMacroWorkspace;
	readonly getConfiguration: () => ProjectConfigurationDto;
	readonly reloadProject: (
		rootPath: string,
	) => Promise<import("@stateful-mcp/macro-protocol").WorkspaceSnapshot>;
	readonly emitWorkspaceChanged: () => void;
}

export function getProjectConfiguration(
	project: MacroProject,
	loaded: LoadedMacroWorkspace,
): ProjectConfigurationDto {
	return toProjectConfigurationDto(project, loaded);
}

export function updateProjectConfiguration(
	context: ProjectConfigurationContext,
	operation: {
		readonly configuration: Omit<
			ProjectConfigurationDto,
			"extensionGroups" | "activeExtensionGroupId"
		>;
		readonly expectedRevision: string;
	},
): Promise<ProjectOperationResult> {
	return update(context, operation);
}

async function update(
	context: ProjectConfigurationContext,
	operation: {
		readonly configuration: Omit<
			ProjectConfigurationDto,
			"extensionGroups" | "activeExtensionGroupId"
		>;
		readonly expectedRevision: string;
	},
): Promise<ProjectOperationResult> {
	const project = context.requireProject();
	const configuration = operation.configuration;
	if (
		Object.hasOwn(configuration, "extensionGroups") ||
		Object.hasOwn(configuration, "activeExtensionGroupId")
	)
		return {
			status: "rejected",
			messageKey: "project.configuration.unsupportedField",
			messageParams: { fields: "extensionGroups|activeExtensionGroupId" },
			diagnostics: [
				{
					code: "unsupportedProjectConfigurationField",
					severity: "error",
					messageKey: "project.configuration.unsupportedField",
					messageParams: { fields: "extensionGroups|activeExtensionGroupId" },
				},
			],
		};
	const current = project.manifest;
	if (
		configuration.backend.kind !== current.backend.kind ||
		configuration.backend.path !== current.backend.path
	)
		return {
			status: "migrationRequired",
			messageKey: "project.configuration.backendChangeRequiresMigration",
			configuration: context.getConfiguration(),
		};
	if (!configuration.displayName.trim())
		return {
			status: "rejected",
			messageKey: "project.configuration.displayNameRequired",
		};
	const validation = validateProjectConfiguration(
		configuration,
		context.loaded().workspace.i18n.getAvailableLocales(),
		buildProjectSettingsContributions(context.loaded()),
	);
	const hasValidationErrors =
		validation.groupDiagnostics.some((item) => item.severity === "error") ||
		validation.diagnostics.some((item) => item.severity === "error");
	if (hasValidationErrors)
		return {
			status: "rejected",
			messageKey: "project.configuration.validationFailed",
			messageParams: {
				groupCount: validation.groupDiagnostics.filter(
					(item) => item.severity === "error",
				).length,
				settingCount: validation.diagnostics.filter(
					(item) => item.severity === "error",
				).length,
			},
			diagnostics: [...validation.groupDiagnostics, ...validation.diagnostics],
			configuration: context.getConfiguration(),
		};
	if (operation.expectedRevision !== project.descriptor.revision)
		return {
			status: "conflict",
			messageKey: "project.configuration.stale",
			configuration: context.getConfiguration(),
		};
	const candidate = {
		...current,
		displayName: configuration.displayName.trim(),
		uiLocale: configuration.uiLocale,
		extensions: configuration.extensions,
		templates: configuration.templates,
		projectSettings: configuration.projectSettings,
	};
	const impact: ProjectConfigurationImpact =
		JSON.stringify(current.templates) !== JSON.stringify(candidate.templates) ||
		JSON.stringify(current.projectSettings) !==
			JSON.stringify(candidate.projectSettings)
			? "templates"
			: current.uiLocale !== candidate.uiLocale ||
					JSON.stringify(current.extensions) !==
						JSON.stringify(candidate.extensions)
				? "workspaceReload"
				: "metadata";
	await project.saveManifest(candidate, operation.expectedRevision);
	if (impact === "workspaceReload") {
		await context.reloadProject(project.rootPath);
		return {
			status: "accepted",
			configuration: context.getConfiguration(),
			impact,
			snapshot: await context.reloadProject(project.rootPath),
		};
	}
	context.emitWorkspaceChanged();
	return {
		status: "accepted",
		configuration: context.getConfiguration(),
		impact,
		snapshot: await context.reloadProject(project.rootPath),
	};
}

export function rejectUnsupportedProjectConfigurationFields(
	context: Pick<ProjectConfigurationContext, "getConfiguration">,
	fields: readonly string[],
): ProjectOperationResult {
	return {
		status: "rejected",
		messageKey: "project.configuration.unsupportedField",
		messageParams: { fields: fields.join("|") },
		configuration: context.getConfiguration(),
		diagnostics: fields.map((field) => ({
			code: "unsupportedProjectConfigurationField",
			severity: "error" as const,
			messageKey: "project.configuration.unsupportedField",
			messageParams: { fields: field },
		})),
	};
}
