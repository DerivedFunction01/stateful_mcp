import { Box, Text } from "ink";

export const WORKSPACE_TABS = [
	{ id: "notebook", label: "Notebook" },
	{ id: "assessment", label: "Assessment" },
	{ id: "soap", label: "SOAP" },
	{ id: "document", label: "Document" },
	{ id: "concepts", label: "Concepts" },
] as const;

export type WorkspaceTabId = (typeof WORKSPACE_TABS)[number]["id"];

export function nextWorkspaceTab(active: WorkspaceTabId): WorkspaceTabId {
	const index = WORKSPACE_TABS.findIndex((tab) => tab.id === active);
	return WORKSPACE_TABS[(index + 1) % WORKSPACE_TABS.length]?.id ?? active;
}

export function WorkspaceTabs({ active }: { active: WorkspaceTabId }) {
	return (
		<Box height={1} paddingLeft={1} overflow="hidden">
			{WORKSPACE_TABS.map((tab, index) => (
				<Text key={tab.id} bold={tab.id === active} inverse={tab.id === active}>
					{index > 0 ? "  " : ""}[{tab.label}]
				</Text>
			))}
		</Box>
	);
}
