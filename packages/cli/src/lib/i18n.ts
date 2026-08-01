/**
 * Minimal display-string resolver for the terminal UI.
 *
 * This is NOT a completion-code system: completion values stay locale-neutral
 * codes (SoapSection codes, schema keys, command verbs). This dictionary only
 * localizes *display labels*. Unknown keys return the key itself so a missing
 * translation never crashes the UI.
 */

const en: Record<string, string> = {
	// Section headers (display only; grouping uses locale-neutral codes)
	"section.subjective": "Subjective",
	"section.objective": "Objective",
	"section.assessment": "Assessment",
	"section.plan": "Plan",
	"section.other": "(other)",

	// Cell status labels
	"status.draft": "draft",
	"status.committed": "committed",
	"status.parsing": "parsing",
	"status.error": "error",
	"status.locked": "locked",
	"status.deleted": "deleted",

	// Cell list
	"celllist.empty": "No cells. Press {key} to create one.",
	"celllist.empty.key": "o",

	// Help bar
	"help.insert": ":w save  Esc NORMAL  Enter newline",
	"help.command": "Tab cycle  Enter execute  Esc cancel  ↑↓ history",
	"help.visual": "d delete  y yank  Esc NORMAL  : command",

	// Help screen
	"help.title": "HELP",
	"help.close": " — press Esc to close",
	"help.editorCommands": "Editor commands",
	"help.cellCommands": "Cell commands",
	"help.keys1": "Keys: j/k ↑/↓ navigate i/o/O insert dd delete yy yank p paste",
	"help.keys2": "u undo Ctrl-r redo r run P preview : command / search",

	// Status bar
	"statusbar.cell": "cell {current}/{total}",
	"statusbar.ins": "ins@{label}",

	// Workspace screen
	"workspace.title": "WORKSPACE",
	"workspace.branches": "{count} branch{plural}",
	"workspace.loading": "loading workspace...",
	"workspace.noBranches":
		"no branches — type a hypothesis to create one, or {cmd}",
	"workspace.branchCmd": "branch <name> <concept>",
	"workspace.globalFacts": "GLOBAL FACTS",
	"workspace.hypothesis": "hypothesis: {value}",
	"workspace.noFindings": "(no findings yet)",
	"workspace.inputHint": "type a finding, hypothesis, or command...",
	"workspace.ruledOut": "✗ ruled_out",
	"workspace.focused": "FOCUSED",

	// Editor command descriptions (locale-neutral keys from EditorCommandRegistry)
	"editor.command.w": "save",
	"editor.command.q": "quit",
	"editor.command.wq": "save & quit",
	"editor.command.e": "edit active cell",
	"editor.command.mode": "set execution mode",
	"editor.command.errors": "show parse errors",
	"editor.command.undo": "undo last change",
	"editor.command.redo": "redo last change",
	"editor.command.search": "search cells",
	"editor.command.nohl": "clear search highlight",
	"editor.command.help": "show help",
	"editor.command.info": "show cell info",
	"editor.command.render": "render preview",
	"editor.command.default": "set default insert section/schema",

	// Editor command args
	"arg.mode.executionMode": "preview|execute",
	"arg.search.term": "search term",
	"arg.default.section": "soap section",
	"arg.default.schema": "target schema",

	// Cell command descriptions (CellCommandRegistry.command.description.*)
	"command.description.up": "move up",
	"command.description.down": "move down",
	"command.description.top": "go to first cell",
	"command.description.bottom": "go to last cell",
	"command.description.go": "go to cell index",
	"command.description.run": "run active cell",
	"command.description.preview": "preview active cell",
	"command.description.delete": "delete selection",
	"command.description.mode": "set cell mode",
	"command.description.set": "set field value",
	"command.description.link": "link cells",
	"command.description.unlink": "unlink cells",
	"command.description.parent": "set parent cell",
	"command.description.workspace": "workspace action",
	"command.description.help": "cell help",
	"command.description.status": "session status",
	"command.description.clear": "clear session",
	"command.description.save": "save session",

	// Cell command args
	"arg.go.index": "target cell index",
	"arg.mode.name": "cell mode",
	"arg.set.field": "schema.field path",
	"arg.set.value": "value",
	"arg.link.targetSchema": "target schema",
	"arg.link.targetCellId": "target cell id",
	"arg.link.targetField": "target field",
	"arg.parent.cellId": "parent cell id",
	"arg.workspace.action": "workspace command verb",
};

export type Locale = typeof en;

const dictionaries: Record<string, Locale> = { en };

let currentLocale: string = "en";

export function setLocale(locale: string): void {
	currentLocale = dictionaries[locale] ? locale : "en";
}

export function getLocale(): string {
	return currentLocale;
}

/**
 * Translate a display string by key. Supports simple {placeholder}
 * substitution via an optional params object.
 */
export function t(
	key: string,
	params?: Record<string, string | number>,
): string {
	const dict = dictionaries[currentLocale] ?? en;
	let template = dict[key] ?? key;
	if (params) {
		for (const [k, v] of Object.entries(params)) {
			template = template.split(`{${k}}`).join(String(v));
		}
	}
	return template;
}

/**
 * Whether a translation exists for the given key.
 */
export function has(key: string): boolean {
	const dict = dictionaries[currentLocale] ?? en;
	return Object.keys(dict).includes(key) || key in dict;
}
