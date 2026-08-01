import type { CommandArgSchema, CommandDescriptor } from "./command-descriptor";
import { CommandGroup } from "./command-descriptor";

const OPERATION_ARGS: CommandArgSchema[] = [
	{
		name: "operation",
		required: true,
		completions: ["set", "update", "eval", "assert", "remove"],
		descriptionKey: "arg.variable.operation",
	},
];

export class VariableCommandProvider {
	getDescriptors(): CommandDescriptor[] {
		return [
			{
				verb: "var",
				aliases: [],
				group: CommandGroup.Field,
				descriptionKey: "command.var",
				args: OPERATION_ARGS,
				cellCommandToken: ":",
			},
		];
	}

	getOperationCompletions(prefix: string): string[] {
		return (
			OPERATION_ARGS[0]?.completions?.filter((value) =>
				value.startsWith(prefix),
			) ?? []
		);
	}
}
