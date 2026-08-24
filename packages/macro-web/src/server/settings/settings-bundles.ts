import { randomUUID } from "node:crypto";
import type { MacroWorkspace } from "@stateful-mcp/macro";
import type { SettingsBundlePayload } from "@stateful-mcp/macro/workspace/config/settings-service";
import type { LoadedMacroWorkspace } from "@stateful-mcp/macro-host";
import type {
	SettingsBundleOperation,
	SettingsBundleResult,
	SettingsScope,
	SettingsUiSnapshotDto,
} from "@stateful-mcp/macro-protocol";
import { SettingsServiceError } from "./settings-operations";
import {
	fromSettingsBundleDto,
	isSettingsBundleDto,
	prepareImportedBundle,
	redactSensitiveBundle,
	toSettingsBundleDto,
	toSettingsDiagnosticDto,
} from "./settings-projections";

/**
 * A bundle staged for two-phase import. The shape matches the
 * `stagedBundle` field historically held on `HostSessionManager`'s `Session`,
 * but is declared here so the staging state can live independently of that
 * manager.
 */
export interface StagedSettingsBundle {
	readonly stageId: string;
	readonly revision: string;
	readonly bundle: SettingsBundlePayload;
	readonly scope: SettingsScope;
	readonly profileId: string;
	readonly mode: "merge" | "replace";
}

/**
 * Session surface required by the settings bundle service. `stagedBundle` is
 * mutated in place during the import-staging flow, so it is writable here.
 */
export interface SettingsBundleSession {
	readonly loaded: LoadedMacroWorkspace;
	stagedBundle?: StagedSettingsBundle;
}

export interface SettingsBundleHost {
	message(
		workspace: MacroWorkspace,
		key: string,
		params?: Readonly<Record<string, string | number>>,
	): string;
	supportedScopes(workspace: MacroWorkspace): SettingsScope[];
	settingsSnapshot(workspace: MacroWorkspace): SettingsUiSnapshotDto;
}

/**
 * Applies a settings bundle operation (export / staged import / apply). Mirrors
 * `HostSessionManager.settingsBundle` exactly: scope/profile validation, bundle
 * shape validation, two-phase staging with optimistic concurrency, and a final
 * apply that consumes the staged bundle.
 */
export async function applySettingsBundleOperation(
	host: SettingsBundleHost,
	session: SettingsBundleSession,
	operation: SettingsBundleOperation,
): Promise<SettingsBundleResult> {
	const workspace = session.loaded.workspace;
	const settings = workspace.settings;
	if (!settings)
		throw new SettingsServiceError(
			"SETTINGS_UNAVAILABLE",
			"Settings are unavailable",
			false,
		);

	if (operation.operation === "export") {
		if (!host.supportedScopes(workspace).includes(operation.scope))
			return {
			status: "unsupported",
			code: "SETTINGS_SCOPE_UNSUPPORTED",
			messageKey: "settings.bundle.scopeUnsupported",
			messageParams: { scope: operation.scope },
		};
		const profiles = await settings.listProfiles();
		if (!profiles.includes(operation.profileId))
			return {
				status: "unsupported",
				code: "SETTINGS_PROFILE_UNSUPPORTED",
				messageKey: "settings.bundle.profileUnsupported",
				messageParams: { profile: operation.profileId },
			};
		const exported = await settings.exportBundle(operation.profileId);
		return {
			status: "exported",
			revision: exported.revision,
			bundle: redactSensitiveBundle(
				toSettingsBundleDto(exported.bundle),
				settings.getSchema(),
			),
		};
	}

	if (operation.operation === "importStage") {
		if (!host.supportedScopes(workspace).includes(operation.scope))
			return {
				status: "unsupported",
				code: "SETTINGS_SCOPE_UNSUPPORTED",
				messageKey: "settings.bundle.scopeUnsupported",
				messageParams: { scope: operation.scope },
			};
		if (!isSettingsBundleDto(operation.bundle))
			return {
				status: "invalid",
				messageKey: "settings.bundle.invalid",
				diagnostics: [
					{
						severity: "error",
						message: host.message(workspace, "settings.bundle.versionInvalid"),
					},
				],
			};
		const profiles = await settings.listProfiles();
		if (!profiles.includes(operation.profileId))
			return {
				status: "unsupported",
				code: "SETTINGS_PROFILE_UNSUPPORTED",
				messageKey: "settings.bundle.profileUnsupported",
				messageParams: { profile: operation.profileId },
			};
		const revision = settings.getSettingsRevision();
		if (operation.expectedRevision && operation.expectedRevision !== revision)
			return {
				status: "stale",
				code: "SETTINGS_REVISION_STALE",
				messageKey: "settings.bundle.stale",
				expectedRevision: operation.expectedRevision,
				actualRevision: revision,
			};
		const prepared = prepareImportedBundle(
			operation.bundle,
			operation.profileId,
			settings.getSchema(),
			host.message.bind(null, workspace),
		);
		if (
			prepared.diagnostics.some((diagnostic) => diagnostic.severity === "error")
		)
			return {
				status: "invalid",
				messageKey: "settings.bundle.invalid",
				diagnostics: prepared.diagnostics,
			};
		const stageId = randomUUID();
		session.stagedBundle = {
			stageId,
			revision,
			bundle: fromSettingsBundleDto(prepared.bundle),
			scope: operation.scope,
			profileId: operation.profileId,
			mode: operation.mode,
		};
		return {
			status: "staged",
			stageId,
			revision,
			diagnostics: prepared.diagnostics,
		};
	}

	const staged = session.stagedBundle;
	if (!staged || staged.stageId !== operation.stageId)
		return {
			status: "invalid",
			messageKey: "settings.bundle.stageUnavailable",
			diagnostics: [
				{
					severity: "error",
					message: host.message(workspace, "settings.bundle.stageUnknown"),
				},
			],
		};
	const expectedRevision = operation.expectedRevision ?? staged.revision;
	if (expectedRevision !== staged.revision)
		return {
			status: "stale",
			code: "SETTINGS_REVISION_STALE",
			messageKey: "settings.bundle.stale",
			expectedRevision: staged.revision,
			actualRevision: expectedRevision,
		};
	const result = await settings.applyBundle(
		staged.bundle,
		staged.profileId,
		operation.mode ?? staged.mode,
		expectedRevision,
	);
	session.stagedBundle = undefined;
	if (result.status === "conflict")
		return {
			status: "stale",
			code: "SETTINGS_REVISION_STALE",
			messageKey: "settings.bundle.stale",
			expectedRevision: result.expectedRevision,
			actualRevision: result.actualRevision,
		};
	if (result.status === "blocked")
		return {
			status: "blocked",
			diagnostics: result.diagnostics.map(toSettingsDiagnosticDto),
			snapshot: host.settingsSnapshot(workspace),
		};
	return {
		status: "applied",
		settingsRevision: result.settingsRevision,
		snapshot: host.settingsSnapshot(workspace),
	};
}
