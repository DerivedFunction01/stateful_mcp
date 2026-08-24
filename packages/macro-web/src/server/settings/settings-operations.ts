import type { MacroWorkspace } from "@stateful-mcp/macro";
import type { SettingsDiagnostic } from "@stateful-mcp/macro/workspace/config/settings-service";
import type { LoadedMacroWorkspace } from "@stateful-mcp/macro-host";
import type {
	SettingsApplyResult,
	SettingsOperation,
	SettingsScope,
	SettingsUiOperation,
	SettingsUiSnapshotDto,
} from "@stateful-mcp/macro-protocol";
import {
	toSettingsDiagnosticDto,
	toSettingsPreviewDto,
} from "./settings-projections";

/**
 * Transport-agnostic error thrown by the settings operation services when the
 * workspace cannot honour a request. Hosts must catch this and map it onto
 * their own boundary error contract (the HostSessionManager historically used
 * its own `SessionError`); the code/message/retryable shape mirrors that.
 */
export class SettingsServiceError extends Error {
	readonly code: string;
	readonly retryable: boolean;
	constructor(code: string, message: string, retryable = false) {
		super(message);
		this.code = code;
		this.retryable = retryable;
	}
}

/**
 * Minimal session surface required by the settings operation services. It is
 * intentionally structural so a host (such as `HostSessionManager`'s `Session`)
 * can be passed directly without a formal dependency on that type.
 */
export interface SettingsOperationSession {
	readonly loaded: LoadedMacroWorkspace;
}

/**
 * Cross-cutting capabilities the settings operation services need but do not
 * own. A host implements this against its own i18n, scope policy, snapshot
 * projection, and event emission so the extracted logic stays decoupled from
 * any single manager.
 */
export interface SettingsOperationHost {
	message(
		workspace: MacroWorkspace,
		key: string,
		params?: Readonly<Record<string, string | number>>,
	): string;
	supportedScopes(workspace: MacroWorkspace): SettingsScope[];
	settingsSnapshot(workspace: MacroWorkspace): SettingsUiSnapshotDto;
	emitSettingsChanged(workspace: MacroWorkspace): void;
}

/**
 * Builds the canonical "saved" result used after a successful mutation or for a
 * plain preview/UI result. Mirrors `HostSessionManager.snapshotResult`.
 */
export function buildSnapshotResult(
	host: SettingsOperationHost,
	workspace: MacroWorkspace,
): SettingsApplyResult {
	const snapshot = host.settingsSnapshot(workspace);
	return {
		status: "saved",
		restartRequired: false,
		settingsRevision: snapshot.settingsRevision,
		snapshot,
	};
}

export function buildSavedResult(
	host: SettingsOperationHost,
	workspace: MacroWorkspace,
	result: {
		readonly status: "saved";
		readonly restartRequired: boolean;
		readonly settingsRevision: string;
	},
): SettingsApplyResult {
	return {
		status: "saved",
		restartRequired: result.restartRequired,
		settingsRevision: result.settingsRevision,
		snapshot: host.settingsSnapshot(workspace),
	};
}

export function buildBlockedResult(
	host: SettingsOperationHost,
	workspace: MacroWorkspace,
	result: {
		readonly status: "blocked";
		readonly diagnostics: readonly SettingsDiagnostic[];
	},
): SettingsApplyResult {
	return {
		status: "blocked",
		diagnostics: result.diagnostics.map(toSettingsDiagnosticDto),
		snapshot: host.settingsSnapshot(workspace),
	};
}

export function buildConflictResult(
	host: SettingsOperationHost,
	workspace: MacroWorkspace,
	result: {
		readonly status: "conflict";
		readonly expectedRevision: string;
		readonly actualRevision: string;
	},
): SettingsApplyResult {
	return {
		status: "conflict",
		code: "SETTINGS_REVISION_STALE",
		message: host.message(workspace, "settings.bundle.stale"),
		expectedRevision: result.expectedRevision,
		actualRevision: result.actualRevision,
		snapshot: host.settingsSnapshot(workspace),
	};
}

export function buildUnsupportedScopeResult(
	host: SettingsOperationHost,
	workspace: MacroWorkspace,
	scope: SettingsScope,
): SettingsApplyResult {
	return {
		status: "unsupported",
		code: "SETTINGS_SCOPE_UNSUPPORTED",
		message: host.message(workspace, "settings.bundle.scopeUnsupported", {
			scope,
		}),
		snapshot: host.settingsSnapshot(workspace),
	};
}

/**
 * Applies a semantic settings operation through the canonical SettingsUiModel
 * and SettingsService. Preserves the behaviour of `HostSessionManager.settings`
 * exactly: preview is side-effect free, save routes through the model and emits
 * on success, and every other mutation emits a `settings.changed` event before
 * returning a snapshot result.
 */
export async function applySettingsOperation(
	host: SettingsOperationHost,
	session: SettingsOperationSession,
	operation: SettingsOperation,
): Promise<SettingsApplyResult> {
	const workspace = session.loaded.workspace;
	const uiModel = workspace.settingsUiModel;
	const settings = workspace.settings;
	if (!uiModel || !settings)
		throw new SettingsServiceError(
			"SETTINGS_UNAVAILABLE",
			"Settings are unavailable",
			false,
		);

	if (operation.operation === "preview") {
		const preview = await settings.preview({
			requestId: operation.requestId,
			settingsRevision:
				operation.expectedRevision ?? settings.getSettingsRevision(),
			path: operation.path,
			draftValue: operation.draftValue,
			effectiveSettings: settings.getEffective(),
			sampleInput: operation.sampleInput,
		});
		return {
			status: "preview",
			preview: toSettingsPreviewDto(preview),
			snapshot: buildSnapshotResult(host, workspace).snapshot,
		};
	}

	switch (operation.operation) {
		case "set":
			uiModel.setValue(operation.path, operation.value);
			break;
		case "replaceJson":
			uiModel.replaceRawJson(operation.rawText);
			break;
		case "save": {
			const result = await uiModel.save(operation.expectedRevision);
			if (result.status === "conflict")
				return buildConflictResult(host, workspace, result);
			if (result.status === "blocked")
				return buildBlockedResult(host, workspace, result);
			host.emitSettingsChanged(workspace);
			return buildSavedResult(host, workspace, result);
		}
		case "discard":
		case "reload":
			await settings.reload();
			break;
		case "profile.select":
			await uiModel.switchProfile(operation.profileId);
			break;
		case "scope.select": {
			const supported = host.supportedScopes(workspace);
			if (!supported.includes(operation.scope)) {
				return buildUnsupportedScopeResult(host, workspace, operation.scope);
			}
			uiModel.setActiveScope(operation.scope);
			break;
		}
		case "jsonMode.toggle":
			if (operation.enabled !== uiModel.getIsSplitJsonMode())
				uiModel.toggleSplitJsonMode();
			break;
	}

	host.emitSettingsChanged(workspace);
	return buildSnapshotResult(host, workspace);
}

/**
 * Applies a settings UI operation (search, filter, scope, section, split-JSON
 * toggle). Mirrors `HostSessionManager.settingsUi`: it never emits, and a
 * rejected scope returns an unsupported result instead of a snapshot.
 */
export async function applySettingsUiOperation(
	host: SettingsOperationHost,
	session: SettingsOperationSession,
	operation: SettingsUiOperation,
): Promise<SettingsApplyResult> {
	const workspace = session.loaded.workspace;
	const uiModel = workspace.settingsUiModel;
	if (!uiModel)
		throw new SettingsServiceError(
			"SETTINGS_UNAVAILABLE",
			"Settings are unavailable",
			false,
		);

	switch (operation.operation) {
		case "settings.ui.scope.set": {
			const supported = host.supportedScopes(workspace);
			if (!supported.includes(operation.scope)) {
				return buildUnsupportedScopeResult(host, workspace, operation.scope);
			}
			uiModel.setActiveScope(operation.scope);
			return buildSnapshotResult(host, workspace);
		}
		case "settings.ui.search.set":
			uiModel.setSearchQuery(operation.query);
			break;
		case "settings.ui.modifiedOnly.set":
			uiModel.setFilterModifiedOnly(operation.enabled);
			break;
		case "settings.ui.jsonMode.toggle":
			uiModel.toggleSplitJsonMode();
			break;
		case "settings.ui.section.set":
			uiModel.setActiveSection(operation.sectionId);
			break;
		default:
			throw new SettingsServiceError(
				"SETTINGS_OPERATION_UNKNOWN",
				"Unknown settings UI operation",
				false,
			);
	}

	return buildSnapshotResult(host, workspace);
}
