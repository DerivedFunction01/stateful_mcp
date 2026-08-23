/**
 * Canonical default Ex-command aliases template.
 * Maps canonical command IDs to default shorthand strings (e.g. :w, :wa, :wq, :q).
 */
export const DEFAULT_COMMAND_ALIASES: Readonly<
	Record<string, readonly string[]>
> = {
	"editor.save": ["w", "write"],
	"editor.saveAll": ["wa", "wall", "writeall"],
	"editor.saveAndClose": ["wq"],
	"editor.closeDocument": ["q", "quit", "close", "tabclose"],
	"editor.closeAll": ["qa", "quitall"],
	"workbench.openSettings": ["settings", "config", "preferences"],
	"workspace.openExtensions": ["extensions", "plugins"],
	"editor.duplicateDocument": ["duplicate", "dup", "copy"],
	"editor.newScratchpad": ["new", "tabnew", "newtab", "scratchpad"],
	"editor.createSplitGroup": ["split", "vsplit", "sp", "vs"],
	"editor.closeGroup": ["only", "closegroup"],
	"workbench.quickOpen": ["open", "edit", "e"],
	"workbench.openProject": ["openproject"],
	"workbench.saveAsProject": ["saveproject", "saveas"],
};
