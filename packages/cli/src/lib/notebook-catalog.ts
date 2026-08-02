import type { AutocompleteSuggestion } from "@stateful-mcp/clinical/notebook/command-autocomplete";
import type { CommandDescriptor } from "@stateful-mcp/clinical/session/command-descriptor";
import type { CommandCatalog, EditorContext } from "./cell-editor";

/**
 * Adapts the notebook's existing `getAutocomplete(partial)` into a
 * `CommandCatalog`. Descriptors come from the caller (editor + cell command
 * registries); suggestions delegate to the notebook autocomplete.
 */
export class NotebookCommandCatalog implements CommandCatalog {
	constructor(
		private readonly descriptorList: CommandDescriptor[],
		private readonly getAutocomplete: (
			partial: string,
		) => AutocompleteSuggestion[],
	) {}

	getDescriptors(_context: EditorContext): CommandDescriptor[] {
		return this.descriptorList;
	}

	getSuggestions(partial: string, _context: EditorContext) {
		return this.getAutocomplete(partial);
	}
}
