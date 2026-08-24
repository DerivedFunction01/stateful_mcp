import type { WorkspaceSnapshot } from "@stateful-mcp/macro-protocol";
import type { LucideIcon } from "lucide-react";
import type { useI18n } from "../../lib/macro-i18n-provider";
import type { PrimarySidebarTab } from "../ActivityRail";

export type DocumentItem = WorkspaceSnapshot["editor"]["documents"][number];

export interface PrimarySidebarProps {
	readonly activeTab?: PrimarySidebarTab;
	readonly snapshot?: WorkspaceSnapshot;
	readonly documents?: readonly DocumentItem[];
	readonly activeDocumentId?: string | null;
	readonly activeDocumentLines?: readonly string[];
	readonly isOpen?: boolean;
	readonly onSelectDocument?: (documentId: string) => void;
	readonly onCloseDocument?: (documentId: string, textRevision: number) => void;
	readonly onNewScratchpad?: () => void;
	readonly onOpenFolderModal?: (mode: "open" | "init" | "saveAs") => void;
	readonly onCommand?: (command: string, args?: readonly unknown[]) => void;
	readonly projectFileTree?: readonly import("@stateful-mcp/macro-protocol").FileTreeItemDto[];
	readonly resourceTree?: readonly import("@stateful-mcp/macro-protocol").ProjectResourceTreeNodeDto[];
	readonly onOpenFile?: (path: string) => void;
	readonly onOpenResource?: (resourceKind: string, resourceId: string) => void;
	readonly onRefreshFileTree?: () => void;
	readonly onCreateFile?: (parent: string, name: string) => void;
	readonly onCreateFolder?: (parent: string, name: string) => void;
	readonly onSearchQueryChange?: (query: string) => void;
	readonly onJumpToLine?: (lineNumber: number, col?: number) => void;
	readonly onReplace?: (
		query: string,
		replacement: string,
		lineNumber?: number,
		startOffset?: number,
	) => void;
	readonly onReplaceAll?: (query: string, replacement: string) => void;
}

export interface HeaderActionConfig {
	readonly id: string;
	readonly getTitle: (t: ReturnType<typeof useI18n>["t"]) => string;
	readonly icon: LucideIcon;
	readonly onClick?: (props: PrimarySidebarProps) => void;
}

export interface SidebarPaneHelpers {
	readonly openEditorsCollapsed: boolean;
	readonly setOpenEditorsCollapsed: React.Dispatch<
		React.SetStateAction<boolean>
	>;
	readonly workspaceCollapsed: boolean;
	readonly setWorkspaceCollapsed: React.Dispatch<React.SetStateAction<boolean>>;
	readonly resourcesCollapsed: boolean;
	readonly setResourcesCollapsed: React.Dispatch<React.SetStateAction<boolean>>;
	readonly searchQuery: string;
	readonly setSearchQuery: React.Dispatch<React.SetStateAction<string>>;
	readonly searchReplace: string;
	readonly setSearchReplace: React.Dispatch<React.SetStateAction<string>>;
	readonly matchCase: boolean;
	readonly setMatchCase: React.Dispatch<React.SetStateAction<boolean>>;
	readonly wholeWord: boolean;
	readonly setWholeWord: React.Dispatch<React.SetStateAction<boolean>>;
	readonly isRegex: boolean;
	readonly setIsRegex: React.Dispatch<React.SetStateAction<boolean>>;
	readonly replaceOpen: boolean;
	readonly setReplaceOpen: React.Dispatch<React.SetStateAction<boolean>>;
	readonly collapsedFiles: ReadonlySet<string>;
	readonly toggleFileCollapsed: (id: string) => void;
	readonly t: ReturnType<typeof useI18n>["t"];
}

export interface SidebarPaneProps {
	readonly props: PrimarySidebarProps;
	readonly helpers: SidebarPaneHelpers;
}

export interface SidebarPaneDescriptor {
	readonly id: PrimarySidebarTab;
	readonly getTitle: (t: ReturnType<typeof useI18n>["t"]) => string;
	readonly actions: readonly HeaderActionConfig[];
	readonly Body: React.ComponentType<SidebarPaneProps>;
}
