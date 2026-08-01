export enum CommandGroup {
	Editor = "editor",
	Navigation = "navigation",
	Cell = "cell",
	Field = "field",
	Workspace = "workspace",
	Session = "session",
	System = "system",
}

export interface CommandArgSchema {
	name: string;
	required: boolean;
	descriptionKey: string;
	completions?: string[];
}

export interface CommandDescriptor {
	verb: string;
	aliases: string[];
	group: CommandGroup;
	descriptionKey: string;
	args: CommandArgSchema[];
	cellCommandToken?: string;
}

export interface CommandLookup {
	byVerb(verb: string): CommandDescriptor | undefined;
	byGroup(group: CommandGroup): CommandDescriptor[];
	all(): CommandDescriptor[];
}
