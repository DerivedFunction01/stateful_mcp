import type { WorkspaceLocaleDictionary } from "../types";
import { ES_CORE } from "./es/core";
import { ES_SETTINGS_APPEARANCE } from "./es/settings-appearance";
import { ES_SETTINGS_CURRENCY } from "./es/settings-currency";
import { ES_SETTINGS_DATETIME } from "./es/settings-datetime";
import { ES_SETTINGS_EDITOR } from "./es/settings-editor";
import { ES_SETTINGS_FREQUENCY } from "./es/settings-frequency";
import { ES_SETTINGS_NUMERIC } from "./es/settings-numeric";
import { ES_SETTINGS_QUANTITY } from "./es/settings-quantity";
import { ES_SETTINGS_SYNTAX } from "./es/settings-syntax";
import { ES_WEB } from "./es/web";

export const ES_LOCALE: WorkspaceLocaleDictionary = {
	...ES_CORE,
	...ES_SETTINGS_SYNTAX,
	...ES_SETTINGS_NUMERIC,
	...ES_SETTINGS_DATETIME,
	...ES_SETTINGS_FREQUENCY,
	...ES_SETTINGS_QUANTITY,
	...ES_SETTINGS_CURRENCY,
	...ES_SETTINGS_APPEARANCE,
	...ES_SETTINGS_EDITOR,
	...ES_WEB,
	"shell.mode.normal": "NORMAL",
	"shell.mode.insert": "INSERCIÓN",
	"shell.mode.visual": "VISUAL",
	"shell.mode.command": "COMANDO",
	"shell.diagnostics.valid": "{count} Válidos",
	"shell.diagnostics.errors": "{count} Errores",
	"workspace.tab.scratchpad": "Borrador",
	"workspace.tab.notebook": "Cuaderno",
	"workspace.tab.settings": "Configuración",
	"sidepanel.slots.title": "Ranuras de Macro y Validación",
	"sidepanel.journal.title": "Historial de Registro y Reversiones",
	"sidepanel.explorer.title": "Explorador",
	"settings.category.syntax": "Sintaxis Principal",
	"settings.category.values": "Fundamentos y Valores",
	"settings.category.appearance": "Apariencia y Tema",
	"settings.category.editor": "Configuración del Editor",
	"settings.category.keymap": "Teclas y Movimientos",
	"settings.category.extensions": "Extensiones",
};
