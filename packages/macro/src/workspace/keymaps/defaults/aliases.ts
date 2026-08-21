/**
 * Canonical default Ex-command aliases template.
 * Maps canonical command IDs to default shorthand strings (e.g. :w, :wa, :wq, :q).
 */
export const DEFAULT_COMMAND_ALIASES: Readonly<
	Record<string, readonly string[]>
> = {
	"workspace.saveActive": ["w", "write"],
	"workspace.saveAll": ["wa", "wall", "writeall"],
	"workspace.saveActiveAndClose": ["wq"],
	"workspace.saveAllAndQuit": ["wqa"],
	"workspace.quit": ["q", "quit"],
	"workspace.quitAll": ["qa", "quitall"],
	"workspace.openSettings": ["settings", "config", "preferences"],
	"workspace.openExtensions": ["extensions", "plugins"],
	"editor.duplicateDocument": ["duplicate", "dup", "copy"],
	"editor.newScratchpad": ["new", "tabnew", "newtab", "scratchpad"],
	"editor.splitGroup": ["split", "vsplit", "sp", "vs"],
	"workbench.openProject": ["open", "edit", "e"],
	"workbench.saveAsProject": ["saveas", "saveproject"],
};
