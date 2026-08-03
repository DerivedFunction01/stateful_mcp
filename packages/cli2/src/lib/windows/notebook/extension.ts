import type { CommandDescriptor } from "@stateful-mcp/clinical/session/command-descriptor";
import { CommandGroup } from "@stateful-mcp/clinical/session/command-descriptor";
import { EditorCommandRegistry } from "@stateful-mcp/clinical/session/editor-command-registry";

// TODO(cli2-v2): replace descriptor conversion and editor-registry dispatch
// with the CLI2 editor catalog plus CommandBarService.
import type {
	CommandContribution,
	EditorExtension,
	WindowEffect,
	WindowIntent,
	WindowScope,
} from "../../runtime/extension";

/**
 * Convert clinical CommandDescriptors into extension CommandContributions.
 * Used to seed a window's (notebook or workspace) command contributions.
 *
 * @param intentTypePrefix Namespacing prefix for the resolved intent type, e.g.
 *   `command.` for notebook, `workspace.` for the workspace profile.
 */
export function descriptorsToContributions(
	descriptors: CommandDescriptor[],
	source: "editor" | "cell" | "window",
	intentTypePrefix = "command.",
): CommandContribution[] {
	// TODO(cli2-v2): replace legacy CommandDescriptor input with canonical 
	// command descriptors and CommandSyntaxProfile mappings.
	return descriptors.map((d) => ({
		id: d.verb,
		intentType: `${intentTypePrefix}${d.group}.${d.verb}`,
		aliases: d.aliases,
		args: d.args.map((a) => ({
			name: a.name,
			required: a.required,
			descriptionKey: a.descriptionKey,
			completions: a.completions,
		})),
		source,
		durable: d.group === CommandGroup.Cell,
		capability:
			d.group === CommandGroup.Workspace ? "workspace.branch" : undefined,
		descriptionKey: d.descriptionKey,
		group: d.group,
	}));
}

/** Basic result → effect routing for window commands (notebook + workspace). */
export function commandResultToEffects(result: {
	success: boolean;
	message?: string;
	action?: string;
	data?: unknown;
}): WindowEffect[] {
	const effects: WindowEffect[] = [];
	switch (result.action) {
		case "quit":
			effects.push({ type: "app.quit" });
			return effects;
		case "show_help":
			effects.push({ type: "router.open", route: "help" });
			return effects;
		case "show_info":
			effects.push({ type: "router.open", route: "info" });
			return effects;
		case "switch_window":
			effects.push({
				type: "router.switchWindow",
				windowKind: (result.data as any)?.windowKind ?? "notebook",
			});
			return effects;
		case "toggle_workspace":
			effects.push({
				type: "router.switchWindow",
				windowKind: "workspace",
			});
			return effects;
		case "render_preview":
			effects.push({
				type: "router.open",
				route: "preview",
				payload: result.data,
			});
			return effects;
		case "show_errors":
			effects.push({ type: "router.open", route: "search" });
			return effects;
		case "search":
			effects.push({
				type: "router.open",
				route: "search",
				payload: result.data,
			});
			return effects;
		case "clear_search":
			effects.push({ type: "router.close" });
			return effects;
		case "undo":
			effects.push({ type: "document.dispatch", action: { type: "undo" } });
			return effects;
		case "redo":
			effects.push({ type: "document.dispatch", action: { type: "redo" } });
			return effects;
		case "set_execution_mode": {
			const mode = (result.data as any)?.mode;
			if (mode === "execute" || mode === "preview")
				effects.push({ type: "editor.mode", mode });
			return effects;
		}
		case "set_default_insert": {
			const data = result.data as
				| { section?: unknown; schema?: unknown }
				| undefined;
			if (typeof data?.section === "string") {
				effects.push({
					type: "editor.defaultInsert",
					section: data.section,
					schema: typeof data.schema === "string" ? data.schema : null,
				});
			}
			return effects;
		}
		case "save":
			effects.push({ type: "editor.message", message: "saved" });
			return effects;
		case "save_quit":
			effects.push({ type: "app.quit" });
			return effects;
		default:
			if (result.message)
				effects.push({ type: "editor.message", message: result.message });
			return effects;
	}
}

/** Execute a shared editor command without coupling a window to notebook state. */
export function dispatchGeneralWindowCommand(line: string): {
	success: boolean;
	message?: string;
	action?: string;
	data?: unknown;
} | null {
	const tokens = line.replace(/^:+/, "").trim().split(/\s+/).filter(Boolean);
	const verb = tokens[0];
	if (!verb) return null;
	const result = EditorCommandRegistry.createDefault().dispatch(
		verb,
		tokens.slice(1),
	);
	return result.success ? result : null;
}

/**
 * The notebook window profile: built from the core + command-input extensions
 * plus notebook command contributions. This is how a window declares its
 * capabilities and contributions in the extension runtime.
 */
export interface NotebookProfileDeps {
	editorDescriptors: CommandDescriptor[];
	cellDescriptors: CommandDescriptor[];
	sharedCellDescriptors?: CommandDescriptor[];
	onCommand(intent: WindowIntent, scope: WindowScope): Promise<WindowEffect[]>;
}

export function buildNotebookExtension(
	deps: NotebookProfileDeps,
): EditorExtension {
	const editorContribs = descriptorsToContributions(
		deps.editorDescriptors,
		"editor",
	);
	const cellContribs = descriptorsToContributions(deps.cellDescriptors, "cell");
	const sharedCellContribs = descriptorsToContributions(
		deps.sharedCellDescriptors ?? [],
		"cell",
	);
	return {
		id: "notebook",
		windows: ["notebook"],
		commands: [...editorContribs, ...cellContribs, ...sharedCellContribs],
		intentHandlers: [
			{
				id: "notebook.commands",
				intentTypes: editorContribs.map((c) => c.intentType),
				handle(intent, ctx) {
					return deps.onCommand(intent, intent.scope);
				},
			},
		],
	};
}
