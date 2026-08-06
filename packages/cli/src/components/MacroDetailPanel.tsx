import type { MacroEditorProps } from "./MacroEditor";
import { MacroEditor } from "./MacroEditor";

/** Variable-height Macro diagnostics and preview presentation for the sidebar. */
export function MacroDetailPanel(props: MacroEditorProps) {
	return <MacroEditor {...props} inputOnly={false} detailsOnly />;
}
