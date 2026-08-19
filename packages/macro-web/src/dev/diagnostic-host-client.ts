import type {
	KeymapBindingResolutionDto,
	SettingsApplyResult,
} from "@stateful-mcp/macro-protocol";
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
			sidepanelWidthRatio: 0.35,
			activeContainerId: "slots",
			focusedPane: "main",
			activeModal: null,
			regions: {
				activity: { open: true, dock: "start", widthRatio: 0.2 },
				inspector: { open: true, dock: "end", widthRatio: 0.35 },
			},
			activeActivityContainerId: "explorer",
			activeInspectorContainerId: "slots",
			inspectorMode: "follow",
			pinnedInspectorViewId: null,
		},
		scratchpad: {},
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
		parse: async () => snapshot,
		subscribe: () => () => undefined,
		subscribeState: (listener) => {
			listener("connected");
			return () => undefined;
		},
		getState: () => "connected",
		getSessionId: () => snapshot.sessionId,
	};
}
