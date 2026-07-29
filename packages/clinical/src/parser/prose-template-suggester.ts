import type { StopWordStore } from "../store/interfaces";
import type { AutocompleteSuggestion } from "../store/reference/auto-complete/interfaces";
import type { ProseParserTemplateStore } from "../store/reference/prose-parser-templates/interfaces";
import type {
	ProseSlot,
	ProseTemplate,
} from "../store/reference/prose-parser-templates/prose-template";

interface SuggestionContext {
	personnelId: string;
	workspaceId?: string;
	specialtyId?: string;
	locale?: string;
}

function isStopWordForPartial(word: string, stopWords: Set<string>): boolean {
	return stopWords.has(word.toLowerCase());
}

interface MatchCandidate {
	template: ProseTemplate;
	slot: ProseSlot;
	matchIndex: number;
	rankScore: number;
}

export class ProseTemplateSuggester {
	constructor(
		private templateStore: ProseParserTemplateStore,
		private stopWordStore?: StopWordStore,
	) {}

	async suggest(
		partialText: string,
		context: SuggestionContext,
	): Promise<AutocompleteSuggestion[]> {
		if (
			partialText.length > 0 &&
			(await this.isCursorInStopWord(partialText, context))
		) {
			return [];
		}

		const templates = await this.templateStore.listAll();
		if (templates.length === 0) return [];

		const lowerPartial = partialText.toLowerCase();
		const partialLen = partialText.length;
		const matches: MatchCandidate[] = [];

		for (const template of templates) {
			let bestMatch: {
				slot: ProseSlot;
				matchIndex: number;
				rankScore: number;
			} | null = null;

			for (const slot of template.slots) {
				if (!slot.triggerPattern) continue;
				const triggerLower = slot.triggerPattern.toLowerCase();
				const matchIndex = lowerPartial.lastIndexOf(triggerLower);
				if (matchIndex === -1) continue;
				const rank = this.slotRank(template, slot, matchIndex, partialLen);
				if (!bestMatch || rank > bestMatch.rankScore) {
					bestMatch = { slot, matchIndex, rankScore: rank };
				}
			}

			if (bestMatch) {
				matches.push({
					template,
					slot: bestMatch.slot,
					matchIndex: bestMatch.matchIndex,
					rankScore: bestMatch.rankScore,
				});
			}
		}

		matches.sort((a, b) => b.rankScore - a.rankScore);
		return matches.slice(0, 5).map((candidate) => {
			const insertText =
				candidate.slot.suggestText ?? candidate.slot.triggerPattern ?? "";
			return {
				templateId: candidate.template.templateId,
				slotName: candidate.slot.slotName,
				triggerPattern: candidate.slot.triggerPattern ?? "",
				insertText,
				cursorOffset: insertText.length,
				targetSchema:
					candidate.slot.targetSchema ?? candidate.template.targetSchema,
				targetConceptId: (candidate.template as any).targetConceptId,
				rankScore: this.clampRank(candidate.rankScore),
				nextHints: this.buildNextHints(candidate.template, candidate.slot),
			};
		});
	}

	private slotRank(
		template: ProseTemplate,
		slot: ProseSlot,
		matchIndex: number,
		partialLen: number,
	): number {
		const templatePriority = template.priority ?? 0;
		const conceptBonus = (template as any).targetConceptId ? 0.1 : 0;
		const proximity = partialLen > 0 ? matchIndex / partialLen : 0;
		const seed = Math.min(templatePriority / 100, 1) + conceptBonus;
		return seed + proximity * 0.2;
	}

	private clampRank(value: number): number {
		return Math.max(0, Math.min(1, value));
	}

	private async isCursorInStopWord(
		partialText: string,
		context: SuggestionContext,
	): Promise<boolean> {
		if (!this.stopWordStore) return false;
		const stopWords =
			await this.stopWordStore.compileStopWordsForContext(context);
		if (stopWords.size === 0) return false;

		const words = partialText.split(/\s+/).filter(Boolean);
		if (words.length === 0) return false;
		const lastWord = words[words.length - 1]!;
		return isStopWordForPartial(lastWord, stopWords);
	}

	// Phase 1: always returns empty list.
	// Phase 1.5+ will evaluate slot.conditions against filled slots.
	private buildNextHints(
		template: ProseTemplate,
		matchedSlot: ProseSlot,
	): AutocompleteSuggestion["nextHints"] {
		return [];
	}
}
