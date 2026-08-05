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
	"help.insert": "{saveCmd} save  {esc} NORMAL  {enter} newline",
	"help.command":
		"{tab} cycle  {enter} execute  {esc} cancel  {arrows} history",
	"command.noMatch": '⚠ no command matches "{partial}" — Enter still runs it',
	"help.visual":
		"{delKey} delete  {yankKey} yank  {esc} NORMAL  {cmdToken} command",

	// Help screen
	"help.title": "HELP",
	"help.close": " — press {esc} to close",
	"help.editorCommands": "Editor commands",
	"help.cellCommands": "Cell commands",
	"help.keysTitle": "Key bindings",
	"help.key.ctrlR": "Ctrl-R",
	"help.key.enter": "Enter",
	"help.key.escape": "Esc",
	"help.key.delete": "Del",
	"help.key.up": "↑",
	"help.key.down": "↓",
	"help.keyGroup.normal": "Normal mode",
	"help.keyGroup.sequences": "Sequences",
	"help.keyGroup.visual": "Visual mode",
	"help.binding.moveDown": "move down",
	"help.binding.moveUp": "move up",
	"help.binding.enterInsert": "insert",
	"help.binding.insertBelow": "insert below",
	"help.binding.insertAbove": "insert above",
	"help.binding.enterVisual": "visual mode",
	"help.binding.pasteBelow": "paste",
	"help.binding.previewCell": "preview",
	"help.binding.runCell": "run",
	"help.binding.undo": "undo",
	"help.binding.redo": "redo",
	"help.binding.command": "command",
	"help.binding.macro": "macro",
	"help.binding.search": "search",
	"help.binding.searchAlt": "search",
	"help.binding.info": "cell info",
	"help.binding.quit": "quit",
	"help.binding.deleteCell": "delete cell",
	"help.binding.yankCell": "yank cell",
	"help.binding.previousError": "previous error",
	"help.binding.nextError": "next error",
	"help.binding.workspace": "workspace",
	"help.binding.pasteAbove": "paste above",
	"help.binding.deleteSelection": "delete selection",
	"help.binding.yankSelection": "yank selection",
	"help.binding.pasteSelection": "paste selection",
	"help.binding.extendDown": "extend down",
	"help.binding.extendUp": "extend up",
	"help.binding.swapAnchor": "swap selection anchor",
	"help.workspaceTitle": "WORKSPACE HELP",
	"help.workspace.hints":
		"Enter newline · Ctrl-Enter submit · Tab/arrows completion · Esc cancel/back",

	// Cell info inspector
	"inspector.title": "CELL INSPECTOR",
	"inspector.mode": "mode: {value}",
	"inspector.scope": "scope: {value}",
	"inspector.confidence": "confidence: {value}",
	"inspector.unavailable": "unavailable",
	"inspector.source": "Source",
	"inspector.routing": "Routing",
	"inspector.diagnostics": "Diagnostics",
	"inspector.interpretation": "Interpretation",
	"inspector.rawSource": "Raw source",
	"inspector.noItems": "(no parsed items)",
	"inspector.noValues": "(no values)",
	"inspector.noFields": "(no extracted fields)",
	"inspector.branch": "branch: {value}",
	"inspector.alternatives": "alternatives: {value}",
	"inspector.validation": "validation: {value}",
	"inspector.unresolved": " (unresolved)",
	"inspector.scrollHint": "scroll: j/k ↑↓ PgUp/PgDn",
	"inspector.closeFooter": "close: I/Esc/q",

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
	"workspace.strip.full":
		"workspace: {id} · branch: {name} · {status} · +{sup} / -{ref}",
	"workspace.strip.short": "workspace {id} · {name} {status}",

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
	"editor.command.workspace": "open the workspace screen (toggle)",
	"editor.command.history": "show command history",
	"history.title": "COMMAND HISTORY",
	"history.scope": "scope: {value}",
	"history.sort": "sort: {value}",
	"history.filter": "filter: {value}",
	"history.scope.session": "session",
	"history.scope.all": "all",
	"history.scope.merged": "merged",
	"history.sort.score": "score",
	"history.sort.recent": "recent",
	"history.sort.frequency": "frequency",
	"history.column.command": "Command",
	"history.column.session": "Session",
	"history.column.all": "All",
	"history.column.uses": "Uses",
	"history.column.lastUsed": "Last used",
	"history.column.source": "Source",
	"history.selected": "Selected: {value}",
	"history.time.justNow": "just now",
	"history.time.minutesAgo": "{value}m ago",
	"history.time.hoursAgo": "{value}h ago",
	"history.time.yesterday": "yesterday",
	"history.time.daysAgo": "{value}d ago",
	"history.empty": "No command history",
	"history.noMatches": "No matching commands",
	"history.hints":
		"↑/↓ move  Enter insert  Tab scope  s sort  / filter  Esc close",

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

	// Macro Editor
	"macro.chooseArg": "Choose or type an argument name",
	"macro.remaining": "Remaining: {names}{example}",
	"macro.example": " (e.g. type '{name}={placeholder}')",
	"macro.allCaptured": "All arguments captured. Press Ctrl+Enter to submit.",
	"macro.status": "Status: ",
	"macro.suggestions": "{arg} suggestions",
	"macro.arguments": "{macro} arguments",
	"macro.suggestionsTitle": "Macro suggestions",
	"macro.chainSuggestion": "Continue with: {next}. Press TAB to expand or ESC to skip.",
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
