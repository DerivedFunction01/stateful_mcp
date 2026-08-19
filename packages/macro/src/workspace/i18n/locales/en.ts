import type { WorkspaceLocaleDictionary } from "../types";
import { EN_CORE } from "./en/core";
import { EN_SETTINGS_APPEARANCE } from "./en/settings-appearance";
import { EN_SETTINGS_CURRENCY } from "./en/settings-currency";
import { EN_SETTINGS_DATETIME } from "./en/settings-datetime";
import { EN_SETTINGS_EDITOR } from "./en/settings-editor";
import { EN_SETTINGS_FREQUENCY } from "./en/settings-frequency";
import { EN_SETTINGS_NUMERIC } from "./en/settings-numeric";
import { EN_SETTINGS_QUANTITY } from "./en/settings-quantity";
import { EN_SETTINGS_SYNTAX } from "./en/settings-syntax";
import { EN_WEB } from "./en/web";

export const EN_LOCALE: WorkspaceLocaleDictionary = {
	...EN_CORE,
	...EN_SETTINGS_SYNTAX,
	...EN_SETTINGS_NUMERIC,
	...EN_SETTINGS_DATETIME,
	...EN_SETTINGS_FREQUENCY,
	...EN_SETTINGS_QUANTITY,
	...EN_SETTINGS_CURRENCY,
	...EN_SETTINGS_APPEARANCE,
	...EN_SETTINGS_EDITOR,
	...EN_WEB,
	"shell.mode.normal": "NORMAL",
	"shell.mode.insert": "INSERT",
	"shell.mode.visual": "VISUAL",
	"shell.mode.command": "COMMAND",
	"shell.diagnostics.valid": "{count} Valid",
	"shell.diagnostics.errors": "{count} Errors",
	"workspace.tab.scratchpad": "Scratchpad",
	"workspace.tab.notebook": "Notebook",
	"workspace.tab.settings": "Settings",
	"sidepanel.slots.title": "Macro Slots & Validation",
	"sidepanel.journal.title": "Journal & Reversals",
	"sidepanel.explorer.title": "Explorer",
	"settings.category.syntax": "Core Syntax",
	"settings.category.values": "Fundamentals & Values",
	"settings.category.appearance": "Appearance & Theme",
	"settings.category.editor": "Editor Configuration",
	"settings.category.keymap": "Keybindings & Motions",
	"settings.category.extensions": "Extensions",
};
