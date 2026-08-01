import type { CdslParser } from "../cdsl-parser";
import type {
	AutocompleteTransitionInsertPlan,
	AutocompleteTransitionStore,
} from "../../store/learning/interfaces";
import type {
	AutocompleteSelection,
	CommandAutocompleteContext,
} from "../../store/reference/auto-complete/command-autocomplete-interfaces";
import type { AutocompleteSuggestion } from "../../store/reference/auto-complete/interfaces";
import type { ProseParserTemplateStore } from "../../store/reference/prose-parser-templates/interfaces";
import type { ParsedItem } from "../schema-parsers";
import { AutocompleteSessionStateMapper } from "./autocomplete-state-mapper";

export interface AutocompleteSessionState {
	activeTemplateId: string | null;
	filledSlots: Record<string, unknown>;
	recentTargetSchemas: string[];
}

export class AutocompleteSessionManager {
	private activeTemplateId: string | null = null;
	private filledSlots: Record<string, unknown> = {};
	private recentTargetSchemas: string[] = [];

	constructor(
		private readonly cdslParser: CdslParser,
		private readonly proseTemplateStore?: ProseParserTemplateStore,
		private readonly transitionStore?: AutocompleteTransitionStore,
		private readonly personnelId: string = "system",
	) {}

	async suggest(partialText: string): Promise<AutocompleteSuggestion[]> {
		const commandContext: CommandAutocompleteContext = {
			recentTargetSchemas: this.recentTargetSchemas,
			filledSlots: this.filledSlots,
			personnelId: this.personnelId,
		};
		return this.cdslParser.suggestAutocomplete(partialText, {
			personnelId: this.personnelId,
		}, commandContext);
	}

	async select(suggestion: AutocompleteSuggestion): Promise<void> {
		if (suggestion.kind === "prose") {
			this.activeTemplateId = suggestion.templateId;
		}

		if (suggestion.kind === "tag" || suggestion.kind === "macro") {
			const now = new Date().toISOString();
			const plan: AutocompleteTransitionInsertPlan = {
				table: "autocomplete_transitions",
				personnelId: this.personnelId,
				templateId: "command",
				fromSlot: suggestion.kind,
				toSlot: suggestion.slotName,
				featureKey: `command_${suggestion.kind}`,
				featureValue: suggestion.slotName,
				numericalValue: null,
				selectionCount: 1,
				lastUpdatedAt: now,
			};
			await this.transitionStore?.increment(plan);
		}
	}

	async updateFromParse(parsedItems: ParsedItem[]): Promise<void> {
		const schemas = parsedItems.map((item) => item.targetSchema);
		this.recentTargetSchemas = [...schemas, ...this.recentTargetSchemas].slice(0, 3);

		if (this.activeTemplateId && this.proseTemplateStore) {
			const template = await this.proseTemplateStore.get(this.activeTemplateId);
			if (template) {
				const slots = AutocompleteSessionStateMapper.mapParsedItemsToSlots(
					parsedItems,
					template,
				);
				Object.assign(this.filledSlots, slots);
			}
		}
	}

	resetSession(): void {
		this.activeTemplateId = null;
		this.filledSlots = {};
		this.recentTargetSchemas = [];
	}

	recordSelection(selection: AutocompleteSelection): void {
		if (selection.kind === "tag" || selection.kind === "macro") {
			const now = new Date().toISOString();
			const plan: AutocompleteTransitionInsertPlan = {
				table: "autocomplete_transitions",
				personnelId: selection.context?.personnelId ?? this.personnelId,
				templateId: "command",
				fromSlot: selection.kind,
				toSlot: selection.value,
				featureKey: `command_${selection.kind}`,
				featureValue: selection.value,
				numericalValue: null,
				selectionCount: 1,
				lastUpdatedAt: now,
			};
			this.transitionStore?.increment(plan);
		}
	}

	getState(): AutocompleteSessionState {
		return {
			activeTemplateId: this.activeTemplateId,
			filledSlots: { ...this.filledSlots },
			recentTargetSchemas: [...this.recentTargetSchemas],
		};
	}
}
