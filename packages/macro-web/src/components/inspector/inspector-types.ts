import type {
	EditorDocumentDto,
	PinnedMacroDto,
	ScratchpadSnapshotDto,
	ScratchpadTemplateDescriptor,
	SidepanelPosition,
} from "@stateful-mcp/macro-protocol";
import type { ComponentType, ReactNode } from "react";

export interface ContributedInspectorView {
	readonly id: string;
	readonly name: string;
	readonly icon: ComponentType<{ size?: number; className?: string }>;
	readonly render: () => ReactNode;
}

export type InspectorTab =
	| "problems"
	| "cell"
	| "slots"
	| "pinned"
	| "template"
	| string;

export type SeverityFilter = "all" | "error" | "warning";

export interface WorkbenchInspectorProps {
	readonly document: ScratchpadSnapshotDto | null;
	readonly meta?: EditorDocumentDto;
	readonly activeLineIndex?: number;
	readonly pinnedMacros?: readonly PinnedMacroDto[];
	readonly isOpen?: boolean;
	readonly onToggleOpen?: () => void;
	readonly dockPosition?: SidepanelPosition;
	readonly onToggleDockPosition?: () => void;
	readonly onPin?: (macroId: string | null) => void;
	readonly onJumpToLine?: (lineNumber: number) => void;
	readonly onInsertSnippet?: (snippet: string) => void;
	readonly onOpenTemplatePicker?: () => void;
	readonly contributedViews?: readonly ContributedInspectorView[];
	readonly activeTemplateDescriptor?: ScratchpadTemplateDescriptor | null;
	readonly onToggleTemplateLiteralArg?: (
		key: string,
		isLiteral: boolean,
	) => void;
	readonly onEditTemplateMetadata?: () => void;
}

export interface InspectorDiagnosticItem {
	readonly line: number;
	readonly macroName?: string;
	readonly message: string;
	readonly messageKey?: string;
	readonly messageParams?: Readonly<Record<string, string | number | boolean>>;
	readonly code?: string;
	readonly severity: "error" | "warning" | "info";
}
