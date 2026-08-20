import type {
	EditorOperation,
	EditorOperationResult,
	KeymapBindingResolutionDto,
	SettingsApplyResult,
	SettingsBundleResult,
} from "@stateful-mcp/macro-protocol";
import { LAYOUT_RATIO_DEFAULTS } from "@stateful-mcp/macro-protocol";
import type { HostClient, HostWorkspaceSnapshot } from "../lib/host-client";

/** Development-only fixture used by the component gallery and transport tests. */
export function createDiagnosticHostClient(): HostClient {
	const snapshot = {
		workspaceId: "sample-workspace",
		sessionId: "web-gallery-session",
		profile: {
			id: "clinical",
			displayName: "Clinical",
			enabledExtensionIds: ["notes", "measurements", "sample.runtime"],
		},
		enabledExtensionIds: ["notes", "measurements", "sample.runtime"],
		applications: ["notes", "measurements", "sample.runtime"].map((id) => ({
			id,
			displayName: id,
		})),
		keymap: { profileId: "default", name: "Fixture", bindings: [] },
		commands: [],
		contributions: { tabs: [], views: [], containers: [] },
		settings: {
			activeProfileId: "clinical",
			availableProfiles: ["clinical"],
			activeScope: "workspace" as const,
			supportedScopes: ["workspace" as const],
			searchQuery: "",
			filterModifiedOnly: false,
			isSplitJsonMode: false,
			jsonModeAvailable: true,
			modifiedCount: 0,
			totalModifiedCount: 0,
			sections: [],
			rawJsonText: "{}",
			hasErrors: false,
			settingsRevision: "macro-settings:fixture",
		} as SettingsApplyResult["snapshot"],
		layout: {
			activeTabId: "scratchpad",
			sidepanelOpen: true,
			sidepanelPosition: "right",
			sidepanelWidthRatio: LAYOUT_RATIO_DEFAULTS.inspector,
			domainRailWidthRatio: LAYOUT_RATIO_DEFAULTS.domainRail,
			activeContainerId: "slots",
			focusedPane: "main",
			activeModal: null,
			regions: {
				activity: {
					open: true,
					dock: "start",
					widthRatio: LAYOUT_RATIO_DEFAULTS.activity,
				},
				inspector: {
					open: true,
					dock: "end",
					widthRatio: LAYOUT_RATIO_DEFAULTS.inspector,
				},
			},
			activeActivityContainerId: "explorer",
			activeInspectorContainerId: "slots",
			inspectorMode: "follow",
			pinnedInspectorViewId: null,
		},
		editor: {
			documents: [
				{
					documentId: "fixture-document",
					providerId: "macro.text",
					title: "Scratchpad",
					dirty: false,
					textRevision: 0,
				},
			],
			groups: [
				{
					groupId: "fixture-group",
					documentIds: ["fixture-document"],
					activeDocumentId: "fixture-document",
					orientation: "horizontal",
				},
			],
			activeGroupId: "fixture-group",
			activeDocumentId: "fixture-document",
			activeDocument: {
				documentId: "fixture-document",
				text: "",
				textRevision: 0,
				lines: [],
			},
			templates: [],
			output: { entries: [], hasMore: false },
			capabilities: {
				canCreate: true,
				canExecute: false,
				canPersist: false,
				canSplit: true,
				canUseVim: true,
			},
		},
		diagnostics: [
			{
				severity: "info" as const,
				message: "Fixture data; host transport is not connected",
			},
		],
		revision: 0,
	} satisfies HostWorkspaceSnapshot;
	const saved = {
		status: "saved" as const,
		restartRequired: false,
		settingsRevision: "macro-settings:fixture",
		snapshot: snapshot.settings,
	};
	return {
		createSession: async () => snapshot,
		getSnapshot: async () => snapshot,
		executeCommand: async () => undefined,
		selectKeymap: async () => snapshot,
		resolveBinding: async (
			chord: string,
		): Promise<KeymapBindingResolutionDto> => ({
			chord,
			diagnostics: [],
		}),
		applySettings: async () => saved,
		applySettingsUi: async () => saved,
		applySettingsBundle: async (): Promise<SettingsBundleResult> => ({
			status: "unsupported",
			code: "FIXTURE_ONLY",
			message: "Settings bundles are unavailable in the diagnostic fixture",
		}),
		applyEditorOperation: async (
			operation: EditorOperation,
		): Promise<EditorOperationResult> => ({
			operation: operation.operation,
			requestId: operation.requestId,
			status: "rejected",
			code: "FIXTURE_ONLY",
			message: "Editor transport is unavailable in the diagnostic fixture",
			snapshot: snapshot.editor,
			workspaceSnapshot: snapshot,
			workspaceRevision: snapshot.revision,
		}),
		subscribe: () => () => undefined,
		subscribeState: (listener) => {
			listener("connected");
			return () => undefined;
		},
		getState: () => "connected",
		getSessionId: () => snapshot.sessionId,
	};
}
