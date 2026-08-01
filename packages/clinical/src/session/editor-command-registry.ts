import type { CommandDescriptor } from "./command-descriptor";
import { CommandGroup } from "./command-descriptor";

export enum EditorCommandVerb {
	Save = "w",
	Quit = "q",
	SaveQuit = "wq",
	Edit = "e",
	Mode = "mode",
	Errors = "errors",
	Undo = "undo",
	Redo = "redo",
	Search = "search",
	NoHL = "nohl",
	Help = "help",
}

export type EditorCommandHandler = (
	verb: EditorCommandVerb,
	args: string[],
) => { success: boolean; message?: string; action?: string; data?: unknown };

export class EditorCommandRegistry {
	private handlers = new Map<string, EditorCommandHandler>();

	register(verb: EditorCommandVerb, handler: EditorCommandHandler): this {
		this.handlers.set(verb, handler);
		return this;
	}

	get(verb: string): EditorCommandHandler | undefined {
		return this.handlers.get(verb as EditorCommandVerb);
	}

	dispatch(
		verb: string,
		args: string[],
	): { success: boolean; message?: string; action?: string; data?: unknown } {
		const handler = this.get(verb);
		if (!handler)
			return { success: false, message: `unknown editor command: ${verb}` };
		return handler(verb as EditorCommandVerb, args);
	}

	getDescriptors(): CommandDescriptor[] {
		return Array.from(this.handlers.keys())
			.sort()
			.map((verb) => {
				const descriptor = EDITOR_COMMAND_META[verb];
				return (
					descriptor ?? {
						verb,
						aliases: [],
						group: CommandGroup.Editor,
						descriptionKey: `editor.command.description.${verb}`,
						args: [],
					}
				);
			});
	}

	static createDefault(): EditorCommandRegistry {
		const registry = new EditorCommandRegistry();
		registry.register(EditorCommandVerb.Save, () => ({
			success: true,
			action: "save",
		}));
		registry.register(EditorCommandVerb.Quit, () => ({
			success: true,
			action: "quit",
		}));
		registry.register(EditorCommandVerb.SaveQuit, () => ({
			success: true,
			action: "save_quit",
		}));
		registry.register(EditorCommandVerb.Edit, () => ({
			success: true,
			action: "edit_cell",
		}));
		registry.register(EditorCommandVerb.Mode, (_v, args) => {
			const mode = args[0];
			if (mode !== "preview" && mode !== "execute")
				return { success: false, message: "mode must be preview or execute" };
			return { success: true, action: "set_execution_mode", data: { mode } };
		});
		registry.register(EditorCommandVerb.Errors, () => ({
			success: true,
			action: "show_errors",
		}));
		registry.register(EditorCommandVerb.Undo, () => ({
			success: true,
			action: "undo",
		}));
		registry.register(EditorCommandVerb.Redo, () => ({
			success: true,
			action: "redo",
		}));
		registry.register(EditorCommandVerb.Search, (_v, args) => ({
			success: true,
			action: "search",
			data: { term: args.join(" ") },
		}));
		registry.register(EditorCommandVerb.NoHL, () => ({
			success: true,
			action: "clear_search",
		}));
		registry.register(EditorCommandVerb.Help, () => ({
			success: true,
			action: "show_help",
		}));
		return registry;
	}
}

const EDITOR_COMMAND_META: Record<string, CommandDescriptor> = {
	w: {
		verb: "w",
		aliases: ["save"],
		group: CommandGroup.Editor,
		descriptionKey: "editor.command.w",
		args: [],
	},
	q: {
		verb: "q",
		aliases: ["quit"],
		group: CommandGroup.Editor,
		descriptionKey: "editor.command.q",
		args: [],
	},
	wq: {
		verb: "wq",
		aliases: [],
		group: CommandGroup.Editor,
		descriptionKey: "editor.command.wq",
		args: [],
	},
	e: {
		verb: "e",
		aliases: ["edit"],
		group: CommandGroup.Editor,
		descriptionKey: "editor.command.e",
		args: [],
	},
	mode: {
		verb: "mode",
		aliases: [],
		group: CommandGroup.Editor,
		descriptionKey: "editor.command.mode",
		args: [
			{
				name: "executionMode",
				required: true,
				descriptionKey: "arg.mode.executionMode",
				completions: ["preview", "execute"],
			},
		],
	},
	errors: {
		verb: "errors",
		aliases: ["err"],
		group: CommandGroup.Editor,
		descriptionKey: "editor.command.errors",
		args: [],
	},
	undo: {
		verb: "undo",
		aliases: ["u"],
		group: CommandGroup.Editor,
		descriptionKey: "editor.command.undo",
		args: [],
	},
	redo: {
		verb: "redo",
		aliases: ["ctrl-r"],
		group: CommandGroup.Editor,
		descriptionKey: "editor.command.redo",
		args: [],
	},
	search: {
		verb: "search",
		aliases: ["/"],
		group: CommandGroup.Editor,
		descriptionKey: "editor.command.search",
		args: [{ name: "term", required: true, descriptionKey: "arg.search.term" }],
	},
	nohl: {
		verb: "nohl",
		aliases: ["noh"],
		group: CommandGroup.Editor,
		descriptionKey: "editor.command.nohl",
		args: [],
	},
	help: {
		verb: "help",
		aliases: ["h", "?"],
		group: CommandGroup.Editor,
		descriptionKey: "editor.command.help",
		args: [],
	},
};
