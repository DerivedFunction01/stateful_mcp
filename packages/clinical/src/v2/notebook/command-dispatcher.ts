import type { V2CommandBarService } from "../commands/command-bar-service";
import type { CommandExecutionInput, CommandPreview } from "../commands/command-bar-types";

/** Native V2 replacement for the V1 notebook CommandDispatcher. */
export class V2NotebookCommandDispatcher {
	constructor(private readonly commandBar: V2CommandBarService) {}

	preview(input: CommandExecutionInput): Promise<CommandPreview> {
		return this.commandBar.preview(input);
	}

	execute(input: CommandExecutionInput) {
		return this.commandBar.execute(input);
	}
}
