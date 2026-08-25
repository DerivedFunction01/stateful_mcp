import type { WorkspaceLocaleDictionary } from "../types";
import { ES_COMMON } from "./es/common";
import { ES_EDITOR } from "./es/editor";
import { ES_ERRORS } from "./es/errors";
import { ES_EXTENSIONS } from "./es/extensions";
import { ES_HOST } from "./es/host";
import { ES_JOURNAL } from "./es/journal";
import { ES_KEYMAP } from "./es/keymap";
import { ES_NAVIGATION } from "./es/navigation";
import { ES_PALETTE } from "./es/palette";
import { ES_PROJECT } from "./es/project";
import { ES_SETTINGS } from "./es/settings";
import { ES_SHELL } from "./es/shell";
import { ES_STATUS } from "./es/status";
import { ES_TEMPLATES } from "./es/templates";
import { ES_WORKBENCH } from "./es/workbench";

export const ES_LOCALE: WorkspaceLocaleDictionary = {
	...ES_SHELL,
	...ES_NAVIGATION,
	...ES_WORKBENCH,
	...ES_PROJECT,
	...ES_TEMPLATES,
	...ES_EDITOR,
	...ES_JOURNAL,
	...ES_PALETTE,
	...ES_SETTINGS,
	...ES_STATUS,
	...ES_HOST,
	...ES_KEYMAP,
	...ES_ERRORS,
	...ES_EXTENSIONS,
	...ES_COMMON,
};
