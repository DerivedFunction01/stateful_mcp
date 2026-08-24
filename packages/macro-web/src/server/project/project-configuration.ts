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
			message:
				"Extension Activation Groups must be changed through the group manager",
			diagnostics: [
				{
					code: "unsupportedProjectConfigurationField",
					severity: "error",
					message:
						"Project configuration field 'extensionGroups' or 'activeExtensionGroupId' is unsupported here",
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
			message: "Changing the project backend requires migration",
			configuration: context.getConfiguration(),
		};
	if (!configuration.displayName.trim())
		return { status: "rejected", message: "Project display name is required" };
	const validationErrors = validateProjectConfiguration(
		configuration,
		context.loaded().workspace.i18n.getAvailableLocales(),
		buildProjectSettingsContributions(context.loaded()),
	);
	if (validationErrors.length > 0)
		return {
			status: "rejected",
			message: validationErrors.join("; "),
			configuration: context.getConfiguration(),
		};
	if (operation.expectedRevision !== project.descriptor.revision)
		return {
			status: "conflict",
			message: "Project configuration is stale",
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
		message: "Extension Activation Groups have a dedicated manager",
		configuration: context.getConfiguration(),
		diagnostics: fields.map((field) => ({
			code: "unsupportedProjectConfigurationField",
			severity: "error" as const,
			message: `Project configuration field '${field}' is unsupported here`,
		})),
	};
}
