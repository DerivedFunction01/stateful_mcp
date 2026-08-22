import {
	LAYOUT_RATIO_DEFAULTS,
	type SidepanelPosition,
	type WorkspaceSnapshot,
} from "@stateful-mcp/macro-protocol";
import { type CSSProperties, useEffect, useState } from "react";
import {
	loadUserPreferences,
	saveUserPreferences,
	subscribeUserPreferences,
} from "../lib/user-preferences-storage";

export function useWorkbenchLayout(
	snapshot: WorkspaceSnapshot | undefined,
	onCommand: (command: string, args?: readonly unknown[]) => void,
) {
	const [userPrefs, setUserPrefs] = useState(() => loadUserPreferences());
	useEffect(() => subscribeUserPreferences(setUserPrefs), []);

	const inspectorPosition = userPrefs.inspectorPosition ?? "right";
	const isInspectorOpen = snapshot?.layout.sidepanelOpen ?? true;
	const isSidebarOpen = snapshot?.layout.regions.activity?.open ?? true;

	const toggleInspector = () => onCommand("workspace.toggleSidepanel");
	const toggleSidebar = () => onCommand("workspace.toggleActivity");
	const setInspectorPosition = (pos: SidepanelPosition) =>
		saveUserPreferences({ inspectorPosition: pos });

	const domainRatio =
		snapshot?.layout.domainRailWidthRatio ?? LAYOUT_RATIO_DEFAULTS.domainRail;
	const sidebarRatio =
		snapshot?.layout.regions.activity?.widthRatio ??
		LAYOUT_RATIO_DEFAULTS.activity;
	const inspectorRatio =
		snapshot?.layout.regions.inspector?.widthRatio ??
		LAYOUT_RATIO_DEFAULTS.inspector;
	const totalFr = 1;

	const shellStyle: CSSProperties = {
		"--sidebar-ratio": sidebarRatio,
		"--inspector-ratio": inspectorRatio,
		"--sidebar-track": `${sidebarRatio}fr`,
		"--inspector-track": `${inspectorRatio}fr`,
	} as CSSProperties;

	return {
		inspectorPosition,
		isInspectorOpen,
		isSidebarOpen,
		toggleInspector,
		toggleSidebar,
		setInspectorPosition,
		domainRatio,
		sidebarRatio,
		inspectorRatio,
		totalFr,
		shellStyle,
	};
}
