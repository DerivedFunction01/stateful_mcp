import { Box, Text } from "ink";
import { t } from "../lib/shared/i18n";

export const WORKSPACE_TABS = [
	{ id: "notebook", labelKey: "workspace.tab.notebook" },
	{ id: "subjective", labelKey: "section.subjective" },
	{ id: "objective", labelKey: "section.objective" },
	{ id: "assessment", labelKey: "workspace.tab.assessment" },
	{ id: "plan", labelKey: "section.plan" },
	{ id: "soap", labelKey: "workspace.tab.soap" },
	{ id: "document", labelKey: "workspace.tab.document" },
	{ id: "concepts", labelKey: "workspace.tab.concepts" },
] as const;

export type WorkspaceTabId = (typeof WORKSPACE_TABS)[number]["id"];

export const ASSESSMENT_TABS = [
	{ id: "default", labelKey: "workspace.assessmentTab.default" },
	{ id: "scratchpad", labelKey: "workspace.assessmentTab.scratchpad" },
	{ id: "editor", labelKey: "workspace.assessmentTab.editor" },
] as const;

export type AssessmentSubTabId = (typeof ASSESSMENT_TABS)[number]["id"];

export function nextWorkspaceTab(active: WorkspaceTabId): WorkspaceTabId {
	const index = WORKSPACE_TABS.findIndex((tab) => tab.id === active);
	return WORKSPACE_TABS[(index + 1) % WORKSPACE_TABS.length]?.id ?? active;
}

export function previousWorkspaceTab(active: WorkspaceTabId): WorkspaceTabId {
	const index = WORKSPACE_TABS.findIndex((tab) => tab.id === active);
	const previous = (index - 1 + WORKSPACE_TABS.length) % WORKSPACE_TABS.length;
	return WORKSPACE_TABS[previous]?.id ?? active;
}

export function nextAssessmentSubTab(
	active: AssessmentSubTabId,
	direction: 1 | -1 = 1,
): AssessmentSubTabId {
	const index = ASSESSMENT_TABS.findIndex((tab) => tab.id === active);
	const next =
		(index + direction + ASSESSMENT_TABS.length) % ASSESSMENT_TABS.length;
	const nextTab = ASSESSMENT_TABS[next];
	return nextTab ? nextTab.id : active;
}

export function WorkspaceTabs({ active }: { active: WorkspaceTabId }) {
	return (
		<Box height={1} paddingLeft={1} overflow="hidden">
			{WORKSPACE_TABS.map((tab, index) => (
				<Text key={tab.id} bold={tab.id === active} inverse={tab.id === active}>
					{index > 0 ? "  " : ""}[{t(tab.labelKey)}]
				</Text>
			))}
		</Box>
	);
}

export function AssessmentTabs({ active }: { active: AssessmentSubTabId }) {
	return (
		<Box height={1} paddingLeft={2} overflow="hidden">
			{ASSESSMENT_TABS.map((tab, index) => (
				<Text key={tab.id} bold={tab.id === active} inverse={tab.id === active}>
					{index > 0 ? "  " : ""}[{t(tab.labelKey)}]
				</Text>
			))}
		</Box>
	);
}
