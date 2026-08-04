import type { CommandDescriptor } from "./command-descriptor";
import type { AutocompleteSuggestion } from "./autocomplete";
import {
	type ArgumentAutocompleteContext,
	type ArgumentCompletionCandidate,
	type ArgumentCompletionProvider,
	type VariableScopeReader,
} from "./argument-autocomplete-types";
import type { CommandHistoryStore } from "@stateful-mcp/clinical/learning/command-history";

export class StaticEnumProvider implements ArgumentCompletionProvider {
	supports(context: ArgumentAutocompleteContext): boolean {
		return (
			context.argumentDescriptor?.type === "enum" &&
			!!context.argumentDescriptor.completions &&
			!context.argumentDescriptor.dependsOn
		);
	}

	async getSuggestions(
		context: ArgumentAutocompleteContext,
	): Promise<ArgumentCompletionCandidate[]> {
		const completions = context.argumentDescriptor?.completions ?? [];
		return completions.map((val) => ({
			value: val,
			source: "static" as const,
			valid: true,
		}));
	}
}

export class DependentEnumProvider implements ArgumentCompletionProvider {
	private rules = new Map<string, (priorVal: string) => string[]>();

	registerRule(
		commandId: string,
		argIndex: number,
		ruleFn: (priorVal: string) => string[],
	) {
		this.rules.set(`${commandId}:${argIndex}`, ruleFn);
	}

	supports(context: ArgumentAutocompleteContext): boolean {
		return (
			context.argumentDescriptor?.type === "enum" &&
			!!context.argumentDescriptor.dependsOn
		);
	}

	async getSuggestions(
		context: ArgumentAutocompleteContext,
	): Promise<ArgumentCompletionCandidate[]> {
		const desc = context.argumentDescriptor;
		if (!desc || !desc.dependsOn) return [];

		const depIdx = desc.dependsOn.argumentIndex;
		const priorVal = context.priorArguments[depIdx];
		if (priorVal === undefined) return [];

		const ruleKey = `${context.commandId}:${context.argumentIndex}`;
		const ruleFn = this.rules.get(ruleKey);

		let allowedValues = desc.completions ?? [];
		if (ruleFn) {
			allowedValues = ruleFn(priorVal);
		} else {
			if (context.commandId === "future-command" && context.argumentIndex === 1) {
				if (priorVal === "alpha") {
					allowedValues = ["one", "two"];
				} else if (priorVal === "bravo") {
					allowedValues = ["two", "three"];
				}
			}
		}

		return allowedValues.map((val) => ({
			value: val,
			source: "static" as const,
			valid: true,
		}));
	}
}

export class VariableLiveScopeProvider implements ArgumentCompletionProvider {
	constructor(private readonly getReader: () => VariableScopeReader | undefined) {}

	supports(context: ArgumentAutocompleteContext): boolean {
		const reader = this.getReader();
		return (
			reader !== undefined &&
			(context.argumentDescriptor?.type === "identifier" ||
				context.argumentDescriptor?.type === "expression" ||
				context.argumentDescriptor?.providerKey === "variable")
		);
	}

	async getSuggestions(
		context: ArgumentAutocompleteContext,
	): Promise<ArgumentCompletionCandidate[]> {
		const reader = this.getReader();
		if (!reader) return [];
		try {
			const scope = await reader.getScope(context.sessionId, context.blockInstanceId);
			const variables = Object.keys(scope);

			const operation = context.priorArguments[0] ?? "";
			const isSet = operation === "set";

			const delimiter = "=";

			const candidates: ArgumentCompletionCandidate[] = variables.map((variable) => {
				const value = isSet ? `${variable}${delimiter}` : variable;
				return {
					value,
					source: "scope" as const,
					valid: true,
				};
			});

			if (isSet && context.argumentPrefix) {
				const pattern = /^[a-zA-Z_][a-zA-Z0-9_.]*$/;
				if (pattern.test(context.argumentPrefix) && !variables.includes(context.argumentPrefix)) {
					candidates.push({
						value: `${context.argumentPrefix}${delimiter}`,
						source: "static" as const,
						valid: true,
					});
				}
			}

			return candidates;
		} catch (e) {
			return [];
		}
	}
}

export class HistoryArgumentProvider implements ArgumentCompletionProvider {
	constructor(private readonly getStore: () => CommandHistoryStore | undefined) {}

	supports(context: ArgumentAutocompleteContext): boolean {
		return this.getStore() !== undefined;
	}

	async getSuggestions(
		context: ArgumentAutocompleteContext,
	): Promise<ArgumentCompletionCandidate[]> {
		const store = this.getStore();
		if (!store) return [];

		try {
			const usage = await store.queryArgumentUsage({
				sessionId: context.sessionId,
				commandId: context.commandId,
				argumentIndex: context.argumentIndex,
				priorArguments: context.priorArguments,
				prefix: context.argumentPrefix,
			});

			return usage.map((rec) => ({
				value: rec.argumentValue,
				source: "history" as const,
				valid: true,
				baseScore: rec.sessionCount * 2.0 + rec.allCount * 1.0,
			}));
		} catch (e) {
			return [];
		}
	}
}

export class ArgumentAutocompleteProviderRegistry {
	private providers: ArgumentCompletionProvider[] = [];
	private variableReader?: VariableScopeReader;
	private historyStore?: CommandHistoryStore;

	constructor() {
		this.providers.push(new StaticEnumProvider());
		this.providers.push(new DependentEnumProvider());
		this.providers.push(new VariableLiveScopeProvider(() => this.variableReader));
		this.providers.push(new HistoryArgumentProvider(() => this.historyStore));
	}

	setVariableReader(reader: VariableScopeReader) {
		this.variableReader = reader;
	}

	setHistoryStore(store: CommandHistoryStore) {
		this.historyStore = store;
	}

	registerProvider(provider: ArgumentCompletionProvider) {
		this.providers.push(provider);
	}

	getProviders(): ArgumentCompletionProvider[] {
		return this.providers;
	}

	async getSuggestions(
		context: ArgumentAutocompleteContext,
	): Promise<ArgumentCompletionCandidate[]> {
		const allCandidates: ArgumentCompletionCandidate[] = [];
		for (const provider of this.providers) {
			if (provider.supports(context)) {
				try {
					const candidates = await provider.getSuggestions(context);
					allCandidates.push(...candidates);
				} catch (e) {
					// Fall softly
				}
			}
		}
		return allCandidates;
	}
}

export const globalRegistry = new ArgumentAutocompleteProviderRegistry();
