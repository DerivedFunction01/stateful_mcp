import type {
	MacroWorkspace,
	ValueAuthoringProfile,
} from "@stateful-mcp/macro";
import type { LoadedMacroWorkspace } from "@stateful-mcp/macro-host";
import type {
	SettingsScope,
	ValueAuthoringOperation,
	ValueAuthoringProfileDto,
	ValueAuthoringResult,
} from "@stateful-mcp/macro-protocol";
import { SettingsServiceError } from "./settings-operations";
import {
	toValueAuthoringDraftDto,
	toValueAuthoringValidationDto,
} from "./value-authoring-projections";

export interface ValueAuthoringOperationSession {
	readonly loaded: LoadedMacroWorkspace;
}

export interface ValueAuthoringOperationHost {
	supportedScopes(workspace: MacroWorkspace): SettingsScope[];
	emitSettingsChanged(workspace: MacroWorkspace): void;
}

export async function applyValueAuthoringOperation(
	host: ValueAuthoringOperationHost,
	session: ValueAuthoringOperationSession,
	operation: ValueAuthoringOperation,
): Promise<ValueAuthoringResult> {
	const workspace = session.loaded.workspace;
	const settings = workspace.settings;
	if (!settings)
		throw new SettingsServiceError({
			code: "SETTINGS_UNAVAILABLE",
			messageKey: "settings.unavailable",
		});
	if (
		operation.operation === "valueAuthoring.load" &&
		operation.scope &&
		!host.supportedScopes(workspace).includes(operation.scope)
	)
		throw new SettingsServiceError({
			code: "SETTINGS_SCOPE_UNSUPPORTED",
			messageKey: "settings.bundle.scopeUnsupported",
		});

	if (operation.operation === "valueAuthoring.load") {
		const exported = await settings.exportBundle(operation.profileId);
		const profile = restoreProfile(
			settings,
			exported.bundle.profiles?.[operation.profileId],
			operation.profileId,
		);
		return {
			status: "loaded",
			settingsRevision: exported.revision,
			draft: toValueAuthoringDraftDto(
				settings.createValueAuthoringDraft(profile, {
					revision: exported.revision,
				}),
			),
		};
	}

	const profileId =
		typeof operation.profile.id === "string" ? operation.profile.id : undefined;
	if (!profileId)
		throw new SettingsServiceError({
			code: "INVALID_REQUEST",
			messageKey: "request.payload.malformed",
		});
	const profile = restoreProfile(settings, operation.profile, profileId);
	const validation = settings.validateAuthoredValues(profile);
	if (operation.operation === "valueAuthoring.validate")
		return {
			status: "validated",
			validation: toValueAuthoringValidationDto(validation),
		};

	if (operation.operation === "valueAuthoring.preview") {
		const revision = settings.getSettingsRevision();
		if (operation.expectedRevision && operation.expectedRevision !== revision)
			return {
				status: "conflict",
				code: "SETTINGS_REVISION_STALE",
				messageKey: "settings.bundle.stale",
				expectedRevision: operation.expectedRevision,
				actualRevision: revision,
			};
		return {
			status: "previewed",
			settingsRevision: revision,
			draft: toValueAuthoringDraftDto(
				settings.createValueAuthoringDraft(profile, {
					revision,
					dirty: true,
					activeDomain: operation.activeDomain,
					selectedGroupId: operation.selectedGroupId,
					selectedRecipeId: operation.selectedRecipeId,
				}),
			),
		};
	}

	if (!validation.valid)
		return {
			status: "blocked",
			diagnostics: toValueAuthoringValidationDto(validation).diagnostics,
			validation: toValueAuthoringValidationDto(validation),
		};
	const result = await settings.applyBundle(
		{
			version: 1,
			exportedAt: new Date().toISOString(),
			profiles: {
				[profile.id]: settings.serializeValueAuthoringProfile(
					profile,
				) as Record<string, unknown>,
			},
		},
		profile.id,
		"merge",
		operation.expectedRevision,
	);
	if (result.status === "conflict")
		return {
			status: "conflict",
			code: "SETTINGS_REVISION_STALE",
			messageKey: "settings.bundle.stale",
			expectedRevision: result.expectedRevision,
			actualRevision: result.actualRevision,
		};
	if (result.status === "blocked")
		return {
			status: "blocked",
			diagnostics: result.diagnostics.map((diagnostic) => ({
				severity: diagnostic.severity,
				code: diagnostic.code,
				path: diagnostic.path,
				messageKey: diagnostic.messageKey,
				messageParams: diagnostic.messageParams,
			})),
			validation: toValueAuthoringValidationDto(validation),
		};
	host.emitSettingsChanged(workspace);
	return {
		status: "saved",
		settingsRevision: result.settingsRevision,
		draft: toValueAuthoringDraftDto(
			settings.createValueAuthoringDraft(profile, {
				revision: result.settingsRevision,
			}),
		),
	};
}

function restoreProfile(
	settings: {
		deserializeValueAuthoringProfile(value: unknown): ValueAuthoringProfile;
	},
	value: unknown,
	id: string,
): ValueAuthoringProfile {
	const source = isRecord(value) ? value : {};
	return settings.deserializeValueAuthoringProfile({
		...source,
		id,
		aliases: source.aliases ?? [],
		fundamentals: source.fundamentals ?? [],
		recipes: source.recipes ?? [],
		argumentPolicies: source.argumentPolicies ?? {},
	} as ValueAuthoringProfileDto);
}

function isRecord(value: unknown): value is Record<string, any> {
	return !!value && typeof value === "object" && !Array.isArray(value);
}
