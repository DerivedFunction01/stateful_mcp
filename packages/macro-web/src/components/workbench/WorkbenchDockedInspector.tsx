import type {
	EditorDocumentDto,
	PinnedMacroDto,
	ScratchpadSnapshotDto,
	SidepanelPosition,
} from "@stateful-mcp/macro-protocol";
import { useI18n } from "../../lib/macro-i18n-provider";
import { WorkbenchInspector } from "../WorkbenchInspector";

export interface WorkbenchDockedInspectorProps {
	readonly document?: ScratchpadSnapshotDto | null;
	readonly meta?: EditorDocumentDto;
	readonly activeLineIndex?: number;
	readonly pinnedMacros?: readonly PinnedMacroDto[];
	readonly isOpen: boolean;
	readonly onToggleOpen: () => void;
	readonly dockPosition: SidepanelPosition;
	readonly onToggleDockPosition: () => void;
	readonly onSetCellDefault: (
		lineNumber: number,
		macroId: string | null,
	) => void;
	readonly onJumpToLine: (lineNumber: number) => void;
	readonly onInsertSnippet: (snippet: string) => void;
	readonly onOpenTemplatePicker?: () => void;
	readonly activeTemplateDescriptor?:
		| import("@stateful-mcp/macro-protocol").ScratchpadTemplateDescriptor
		| null;
	readonly onToggleTemplateLiteralArg?: (
		key: string,
		isLiteral: boolean,
	) => void;
	readonly onEditTemplateMetadata?: () => void;
}

export function WorkbenchDockedInspector({
	document = null,
	meta,
	activeLineIndex,
	pinnedMacros,
	isOpen,
	onToggleOpen,
	dockPosition,
	onToggleDockPosition,
	onSetCellDefault,
	onJumpToLine,
	onInsertSnippet,
	onOpenTemplatePicker,
	activeTemplateDescriptor,
	onToggleTemplateLiteralArg,
	onEditTemplateMetadata,
}: WorkbenchDockedInspectorProps) {
	const { t } = useI18n();

	return (
		<aside
			className="workbench-inspector"
			aria-label={t("workbench.inspector")}
			style={!isOpen ? { width: 46, minWidth: 46, maxWidth: 46 } : undefined}
		>
			<WorkbenchInspector
				document={document}
				meta={meta}
				activeLineIndex={activeLineIndex}
				pinnedMacros={pinnedMacros}
				isOpen={isOpen}
				onToggleOpen={onToggleOpen}
				dockPosition={dockPosition}
				onToggleDockPosition={onToggleDockPosition}
				onSetCellDefault={onSetCellDefault}
				onJumpToLine={onJumpToLine}
				onInsertSnippet={onInsertSnippet}
				onOpenTemplatePicker={onOpenTemplatePicker}
				activeTemplateDescriptor={activeTemplateDescriptor}
				onToggleTemplateLiteralArg={onToggleTemplateLiteralArg}
				onEditTemplateMetadata={onEditTemplateMetadata}
			/>
		</aside>
	);
}
