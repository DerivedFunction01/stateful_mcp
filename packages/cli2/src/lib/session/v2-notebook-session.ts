import type { CommandAutocompleteContext, CommandSuggestion } from "@stateful-mcp/clinical/v2/commands/command-bar-types";
import { getCommandBarSuggestions } from "@stateful-mcp/clinical/v2/commands/command-autocomplete-provider";
import type { V2CommandBarService } from "@stateful-mcp/clinical/v2/commands/command-bar-service";
import type { V2CommandSyntaxProfile } from "@stateful-mcp/clinical/v2/commands/command-syntax-profile";
import type { ClinicalEngineV2 } from "@stateful-mcp/clinical/v2/engine/clinical-engine-v2";
import type { StructuredCellService } from "@stateful-mcp/clinical/v2/cells/structured-cell-service";
import type { V2VariableCellService } from "@stateful-mcp/clinical/v2/cells/variable-cell-service";
import type { CellStore } from "@stateful-mcp/clinical/v2/cells/cell-service-types";
import type { V2NotebookSessionStore } from "@stateful-mcp/clinical/v2/notebook/notebook-session-store";

export interface V2NotebookSession {
	sessionId: string;
	engine: ClinicalEngineV2;
	commandBar: V2CommandBarService;
	cellService: StructuredCellService;
	cellStore: CellStore;
	variableCells: V2VariableCellService;
	syntaxProfile: V2CommandSyntaxProfile;
	sessionStore: V2NotebookSessionStore;
	getAutocomplete(context: CommandAutocompleteContext): Promise<CommandSuggestion[]>;
}

export function createV2NotebookSession(input: {
	sessionId: string;
	engine: ClinicalEngineV2;
	commandBar: V2CommandBarService;
	variableCells: V2VariableCellService;
	syntaxProfile: V2CommandSyntaxProfile;
	sessionStore: V2NotebookSessionStore;
}): V2NotebookSession {
	const runtime = input.engine.getRuntime();
	return {
		...input,
		cellService: input.engine.getCellService(),
		cellStore: runtime.stores.cellStore,
		getAutocomplete: (context) =>
			getCommandBarSuggestions(context, {
				macroStore: runtime.macros.defs,
				schemaRegistry: runtime.macros.schemaRegistry,
			}, input.syntaxProfile),
	};
}
