import type { WorkspaceLocaleDictionary } from "../types";
import { EN_SHELL } from "./en/shell";
import { EN_NAVIGATION } from "./en/navigation";
import { EN_WORKBENCH } from "./en/workbench";
import { EN_EDITOR } from "./en/editor";
import { EN_JOURNAL } from "./en/journal";
import { EN_PALETTE } from "./en/palette";
import { EN_SETTINGS } from "./en/settings";
import { EN_STATUS } from "./en/status";
import { EN_HOST } from "./en/host";
import { EN_KEYMAP } from "./en/keymap";
import { EN_COMMANDS } from "./en/commands";
import { EN_ERRORS } from "./en/errors";
import { EN_COMMON } from "./en/common";

export const EN_LOCALE: WorkspaceLocaleDictionary = {
	...EN_SHELL,
	...EN_NAVIGATION,
	...EN_WORKBENCH,
	...EN_EDITOR,
	...EN_JOURNAL,
	...EN_PALETTE,
	...EN_SETTINGS,
	...EN_STATUS,
	...EN_HOST,
	...EN_KEYMAP,
	...EN_COMMANDS,
	...EN_ERRORS,
	...EN_COMMON,
};
