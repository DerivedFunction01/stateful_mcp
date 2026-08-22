import {
	LAYOUT_RATIO_DEFAULTS,
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

	const toggleInspector = () => onCommand("workspace.toggleSidepanel");
	const setInspectorPosition = (pos: "left" | "right") =>
		saveUserPreferences({ inspectorPosition: pos });

	const domainRatio =
		snapshot?.layout.domainRailWidthRatio ?? LAYOUT_RATIO_DEFAULTS.domainRail;
	const sidebarRatio =
		snapshot?.layout.regions.activity?.widthRatio ??
		LAYOUT_RATIO_DEFAULTS.activity;
	const inspectorRatio =
		snapshot?.layout.regions.inspector?.widthRatio ??
		LAYOUT_RATIO_DEFAULTS.inspector;
	const totalFr = domainRatio + sidebarRatio + 1 + inspectorRatio;

	const shellStyle: CSSProperties = {
		"--domain-rail-ratio": domainRatio,
		"--sidebar-ratio": sidebarRatio,
		"--inspector-ratio": inspectorRatio,
		"--domain-rail-track": `${domainRatio}fr`,
		"--sidebar-track": `${sidebarRatio}fr`,
		"--inspector-track": `${inspectorRatio}fr`,
	} as CSSProperties;

	return {
		inspectorPosition,
		isInspectorOpen,
		toggleInspector,
		setInspectorPosition,
		domainRatio,
		sidebarRatio,
		inspectorRatio,
		totalFr,
		shellStyle,
	};
}
