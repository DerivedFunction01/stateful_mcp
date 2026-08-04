import type { CommandCatalog, EditorContext } from "../../editor";
import type { AutocompleteSuggestion } from "../../editor/autocomplete";
import type { CommandDescriptor } from "../../editor/command-descriptor";

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
