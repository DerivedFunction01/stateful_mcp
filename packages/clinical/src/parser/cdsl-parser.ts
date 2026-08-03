import type { DictionaryStore } from "@stateful-mcp/core";
import type {
	AttributeParserRule,
	ParserSyntaxProfile,
	StopWordContext,
	StopWordStore,
} from "../store/interfaces";
import type {
	AutocompleteTransitionStore,
	ParseConfidenceScoreBreakdown,
	ParsedCellHistoryStore,
	ScoredParsedItem,
	SystemWeightStore,
} from "../store/learning/interfaces";
import type { CommandAutocompleteContext } from "../store/reference/auto-complete/command-autocomplete-interfaces";
import type { AutocompleteSuggestion } from "../store/reference/auto-complete/interfaces";
import type { CommandAutocompleteSuggester } from "./command/command-autocomplete-suggester";
import type { ParsedCandidateEnvelope, ParsedItem } from "./schema-parsers";
import type { StopWordParser } from "./stop-word-parser";
import { TextPreprocessor } from "./text-preprocessor";

interface ParserPreviewResult extends ParsedCandidateEnvelope {
	targetSchema: string;
}

export interface ClinicalParseResult {
	items: ParsedItem[];
	scoredItems: ScoredParsedItem[];
	confidence?: {
		score: number;
		level: "high" | "medium" | "low";
		breakdown?: ParseConfidenceScoreBreakdown;
	};
}

export interface CdslParserOptions {
	dictionaryStore: DictionaryStore;
	profile: ParserSyntaxProfile;
	stopWordParser?: StopWordParser;
	stopWordStore?: StopWordStore;
	weightStore?: SystemWeightStore;
	autocompleteTransitionStore?: AutocompleteTransitionStore;
	commandSuggester?: CommandAutocompleteSuggester;
}

function emptyParseResult(): ClinicalParseResult {
	return {
		items: [],
		scoredItems: [],
		confidence: undefined,
	};
}

/**
 * CDSL parser — dismantled in Engine V2.
 *
 * The legacy CDSL/prose parsing pipeline is retired. All parse, preview,
 * and autocomplete entry points are no-ops returning blank results so that
 * transitional callers (engine, workspace, cell processing) continue to
 * compile and behave as if there is no structured parsing available. Typed
 * command macros are the V2 authoring path and live separately.
 */
export class CdslParser {
	private dictionaryStore: DictionaryStore;
	private profile: ParserSyntaxProfile;
	private preprocessor: TextPreprocessor;

	constructor(options: CdslParserOptions) {
		this.dictionaryStore = options.dictionaryStore;
		this.profile = options.profile;
		this.preprocessor = new TextPreprocessor();
	}

	static async create(options: CdslParserOptions): Promise<CdslParser> {
		return new CdslParser(options);
	}

	getProfile(): ParserSyntaxProfile {
		return this.profile;
	}

	getPreprocessor(): TextPreprocessor {
		return this.preprocessor;
	}

	getEffectiveAttributeRules(): AttributeParserRule[] {
		return this.profile.attributeRules ?? [];
	}

	async resolveConcept(_text: string): Promise<unknown> {
		return null;
	}

	async suggestAutocomplete(
		_partialText: string,
		_context: StopWordContext,
		_commandContext?: CommandAutocompleteContext,
	): Promise<AutocompleteSuggestion[]> {
		return [];
	}

	async preview(
		_text: string,
		_context?: StopWordContext,
		_historyStore?: ParsedCellHistoryStore,
		_routingContext?: {
			targetSchema?: string | null;
			resolvedSection?: string | null;
		},
	): Promise<ParserPreviewResult[]> {
		return [];
	}

	async parseDetailed(
		_text: string,
		_context?: StopWordContext,
		_routingContext?: {
			targetSchema?: string | null;
			resolvedSection?: string | null;
		},
	): Promise<ClinicalParseResult> {
		return emptyParseResult();
	}

	async parse(
		_text: string,
		_context?: StopWordContext,
		_routingContext?: {
			targetSchema?: string | null;
			resolvedSection?: string | null;
		},
	): Promise<ParsedItem[]> {
		return [];
	}

	async parseWithHistoryDetailed(
		_text: string,
		_context?: StopWordContext,
		_historyStore?: ParsedCellHistoryStore,
		_routingContext?: {
			targetSchema?: string | null;
			resolvedSection?: string | null;
		},
	): Promise<ClinicalParseResult> {
		return emptyParseResult();
	}

	async parseWithHistory(
		_text: string,
		_context?: StopWordContext,
		_historyStore?: ParsedCellHistoryStore,
		_routingContext?: {
			targetSchema?: string | null;
			resolvedSection?: string | null;
		},
	): Promise<ParsedItem[]> {
		return [];
	}
}
