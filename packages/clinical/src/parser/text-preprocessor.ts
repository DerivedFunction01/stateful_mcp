import {
	type DictionaryStore,
	MemoryVariableStore,
	type VariableService,
	VariableServiceStore,
} from "@stateful-mcp/core";
import type {
	ParserMacroStore,
	ParserSyntaxProfile,
} from "../store/interfaces";
import { MacroExpander } from "./macro-expander";
import { CdslVariableParser } from "./variable-parser";

export class TextPreprocessor {
	constructor(
		private variableService: VariableService | undefined,
		private profile: ParserSyntaxProfile,
		private macroStore?: ParserMacroStore,
		private dictionaryStore?: DictionaryStore,
	) {}

	async applyVariables(text: string, sessionId: string): Promise<string> {
		const service =
			this.variableService ??
			new VariableServiceStore(new MemoryVariableStore());
		return CdslVariableParser.parseAndApply(
			text,
			service,
			sessionId,
			this.profile,
			this.dictionaryStore,
		);
	}

	async expandMacros(text: string): Promise<string> {
		if (!this.macroStore) return text;
		return MacroExpander.expand(text, this.macroStore, this.profile);
	}

	async preprocess(text: string, sessionId: string): Promise<string> {
		const afterVars = await this.applyVariables(text, sessionId);
		return this.expandMacros(afterVars);
	}
}
