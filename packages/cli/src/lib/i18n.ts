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
