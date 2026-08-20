import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
	DEFAULT_EDITOR_KEYMAP_PROFILE,
	type EditorKeymapProfile,
	mergeEditorKeymap,
	validateEditorKeymap,
} from "@stateful-mcp/macro";
import {
	type LoadedMacroWorkspace,
	type LoadMacroWorkspaceOptions,
	loadMacroWorkspace,
} from "@stateful-mcp/macro-host";
import {
	DEFAULT_WORKSPACE_SETTINGS_VALUES,
	getDefaultSettingsSchema,
	getDefaultSettingsSemanticProviders,
} from "./config/default-settings";

export interface LoadMacroCliOptions extends LoadMacroWorkspaceOptions {
	readonly keymapPath?: string;
	readonly inspect?: boolean;
	readonly inspectTarget?: string;
}

export interface LoadedMacroCliWorkspace extends LoadedMacroWorkspace {
	readonly keymap: EditorKeymapProfile;
}

/**
 * CLI composition only: the host owns workspace/bootstrap state while this
 * function adds the terminal keymap and CLI settings/locales required by the
 * OpenTUI renderer.
 */
export async function loadMacroCliWorkspace(
	options: LoadMacroCliOptions = {},
): Promise<LoadedMacroCliWorkspace> {
	const keymapOverride = options.keymapPath
		? await readJsonFile<Partial<EditorKeymapProfile>>(options.keymapPath)
		: undefined;
	const keymap = mergeEditorKeymap(
		DEFAULT_EDITOR_KEYMAP_PROFILE,
		keymapOverride,
	);
	const errors = validateEditorKeymap(keymap, {
		allowSequencePrefixes: true,
	}).filter((diagnostic) => diagnostic.severity === "error");
	if (errors.length > 0) {
		throw new Error(
			`Invalid editor keymap: ${errors.map((diagnostic) => diagnostic.message).join("; ")}`,
		);
	}

	const loaded = await loadMacroWorkspace({
		...options,
		settings: {
			defaults: DEFAULT_WORKSPACE_SETTINGS_VALUES,
			schema: getDefaultSettingsSchema,
			semanticProviders: getDefaultSettingsSemanticProviders(),
		},
	});
	return { ...loaded, keymap };
}

async function readJsonFile<T>(path: string): Promise<T> {
	const text = await readFile(resolve(path), "utf8");
	return JSON.parse(text) as T;
}

export {
	type LoadedMacroWorkspace,
	type LoadMacroWorkspaceOptions,
	loadMacroWorkspace,
	readWorkspaceManifest,
	resolveWorkspaceExtensions,
	validateWorkspaceManifest,
} from "@stateful-mcp/macro-host";
