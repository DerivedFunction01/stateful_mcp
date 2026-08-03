import type { CommandBarService } from "../commands/command-bar-service";
import type {
	CommandExecutionInput,
	CommandPreview,
} from "../commands/command-bar-types";

/** Native  replacement for the V1 notebook CommandDispatcher. */
export class NotebookCommandDispatcher {
	constructor(private readonly commandBar: CommandBarService) {}

	preview(input: CommandExecutionInput): Promise<CommandPreview> {
		return this.commandBar.preview(input);
	}

	execute(input: CommandExecutionInput) {
		return this.commandBar.execute(input);
	}
}
