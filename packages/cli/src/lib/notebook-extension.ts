import type { CommandDescriptor } from "@stateful-mcp/clinical/session/command-descriptor";
import { CommandGroup } from "@stateful-mcp/clinical/session/command-descriptor";
import type {
	CommandContribution,
	EditorExtension,
	WindowEffect,
	WindowIntent,
	WindowScope,
} from "./editor-extension";

/**
 * Convert clinical CommandDescriptors into extension CommandContributions.
 * Used to seed the notebook's extension command contributions.
 */
export function descriptorsToContributions(
	descriptors: CommandDescriptor[],
	source: "editor" | "cell" | "window",
): CommandContribution[] {
	return descriptors.map((d) => ({
		id: d.verb,
		intentType: `command.${d.group}.${d.verb}`,
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

/** Basic result → effect routing for notebook commands. */
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
		case "save":
			effects.push({ type: "editor.message", message: "saved" });
			return effects;
		default:
			if (result.message)
				effects.push({ type: "editor.message", message: result.message });
			return effects;
	}
}

/**
 * The notebook window profile: built from the core + command-input extensions
 * plus notebook command contributions. This is how a window declares its
 * capabilities and contributions in the extension runtime.
 */
export interface NotebookProfileDeps {
	editorDescriptors: CommandDescriptor[];
	cellDescriptors: CommandDescriptor[];
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
	return {
		id: "notebook",
		windows: ["notebook"],
		commands: [...editorContribs, ...cellContribs],
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
