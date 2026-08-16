import type { DomainFixture, PrototypeCommand, PrototypeLine, PrototypeJournalEntry, PrototypeWorkspaceState } from "./model";

const coreLines: readonly PrototypeLine[] = [
	{ text: '^echo message="Hello workspace"', preview: "Hello workspace", status: "valid" },
	{ text: '^deploy service=api env=staging', preview: "Deploy api to staging", status: "valid" },
	{ text: "plain text without a macro", status: "invalid", diagnostic: "Unknown macro or plain text" },
];

const commands: readonly PrototypeCommand[] = [
	{ id: "view.explorer", title: "Open Explorer", category: "Navigation", shortcut: "Alt+1" },
	{ id: "view.slots", title: "Open Macro Slots", category: "Navigation", shortcut: "Alt+2" },
	{ id: "view.journal", title: "Open Journal", category: "Navigation", shortcut: "Alt+3" },
	{ id: "view.toggle-panel", title: "Toggle Sidepanel", category: "Workspace", shortcut: "Ctrl+B" },
	{ id: "scratchpad.execute", title: "Execute Valid Lines", category: "Scratchpad", shortcut: "Ctrl+Enter" },
	{ id: "workspace.help", title: "Open Help", category: "System", shortcut: "?" },
];

const journalEntries: readonly PrototypeJournalEntry[] = [
	{ id: "j1", time: "14:32", macro: "deploy api staging", status: "committed", fingerprint: "a91c3e" },
	{ id: "j2", time: "14:34", macro: "deploy web staging", status: "reversed", fingerprint: "f2d811", reason: "Deployment timed out" },
];

export function createFixture(fixture: DomainFixture = "core"): PrototypeWorkspaceState {
	return {
		fixture,
		activeTabId: "scratchpad",
		activeActivityViewId: "workspace",
		activeInspectorViewId: "explorer",
		inspectorMode: "follow",
		panelRegions: {
			activity: { open: true, dock: "start" },
			inspector: { open: true, dock: "end" },
		},
		paletteOpen: false,
		paletteQuery: "",
		paletteSelection: 0,
		dropdownOpen: fixture === "retail",
		selectedDropdownValue: "Clothing",
		diagramNode: "api",
		scratchpadLines: fixture === "retail"
			? [{ text: "^product sku=ABC-123", preview: "Product ABC-123", status: "valid" }, { text: "category=", status: "pinned", diagnostic: "Select a category" }]
			: coreLines,
		journalEntries,
		commands,
	};
}
