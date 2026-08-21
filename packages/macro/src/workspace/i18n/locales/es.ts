import type { WorkspaceLocaleDictionary } from "../types";
import { ES_SHELL } from "./es/shell";
import { ES_NAVIGATION } from "./es/navigation";
import { ES_WORKBENCH } from "./es/workbench";
import { ES_EDITOR } from "./es/editor";
import { ES_JOURNAL } from "./es/journal";
import { ES_PALETTE } from "./es/palette";
import { ES_SETTINGS } from "./es/settings";
import { ES_STATUS } from "./es/status";
import { ES_HOST } from "./es/host";
import { ES_KEYMAP } from "./es/keymap";
import { ES_COMMANDS } from "./es/commands";
import { ES_ERRORS } from "./es/errors";
import { ES_COMMON } from "./es/common";

export const ES_LOCALE: WorkspaceLocaleDictionary = {
	...ES_SHELL,
	...ES_NAVIGATION,
	...ES_WORKBENCH,
	...ES_EDITOR,
	...ES_JOURNAL,
	...ES_PALETTE,
	...ES_SETTINGS,
	...ES_STATUS,
	...ES_HOST,
	...ES_KEYMAP,
	...ES_COMMANDS,
	...ES_ERRORS,
	...ES_COMMON,
};
