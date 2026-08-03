import type { MacroStore } from "../macros/macro-definition";
import type { SchemaRegistry } from "../schemas/schema-registry";
import { getCommandBarSuggestions } from "../commands/command-autocomplete-provider";
import type { CommandAutocompleteContext, CommandSuggestion } from "../commands/command-bar-types";
import type { V2CommandSyntaxProfile } from "../commands/command-syntax-profile";

/** Native V2 replacement for notebook command/macro autocomplete modules. */
export function getV2NotebookAutocomplete(
	context: CommandAutocompleteContext,
	dependencies: { macroStore?: MacroStore; schemaRegistry?: SchemaRegistry; profile?: V2CommandSyntaxProfile } = {},
): Promise<CommandSuggestion[]> {
	return getCommandBarSuggestions(context, dependencies, dependencies.profile);
}
