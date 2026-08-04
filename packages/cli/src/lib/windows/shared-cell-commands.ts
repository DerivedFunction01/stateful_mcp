import type { CommandDescriptor } from "../editor/command-descriptor";

const VARIABLE_COMMANDS: CommandDescriptor[] = [
	{
		verb: "var",
		aliases: ["variable"],
		group: "cell",
		descriptionKey: "command.variable",
		args: [],
	},
];

export function getSharedCellCommandDescriptors(): CommandDescriptor[] {
	return VARIABLE_COMMANDS;
}

export function isSharedVariableCommand(verb: string): boolean {
	return VARIABLE_COMMANDS.some(
		(descriptor) =>
			descriptor.verb.toLowerCase() === verb.toLowerCase() ||
			descriptor.aliases.some(
				(alias) => alias.toLowerCase() === verb.toLowerCase(),
			),
	);
}
