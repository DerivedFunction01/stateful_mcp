import { getCommandBarSuggestions } from "../commands/command-autocomplete-provider";
import type {
	CommandAutocompleteContext,
	CommandSuggestion,
} from "../commands/command-bar-types";
import type { CommandSyntaxProfile } from "../commands/command-syntax-profile";
import type { MacroStore } from "../macros/macro-definition";
import type { SchemaRegistry } from "../schemas/schema-registry";

/** Native  replacement for notebook command/macro autocomplete modules. */
export function getNotebookAutocomplete(
	context: CommandAutocompleteContext,
	dependencies: {
		macroStore?: MacroStore;
		schemaRegistry?: SchemaRegistry;
		profile?: CommandSyntaxProfile;
	} = {},
): Promise<CommandSuggestion[]> {
	return getCommandBarSuggestions(context, dependencies, dependencies.profile);
}
