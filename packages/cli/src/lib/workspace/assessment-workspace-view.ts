import {
	type BranchStatus,
	type CommandSyntaxProfile,
	type ConceptLookup,
	DIRECT_VERB_TO_BRANCH_STATUS,
	type DirectCommandVerb,
	type ImpliedBranchTransition,
	resolveConceptValue,
} from "@stateful-mcp/clinical";
import type { WorkspaceSnapshot } from "@stateful-mcp/clinical/workspaces/workspace-snapshot";
import type { ExtensionProjection, PinnedMacroLineContext } from "@stateful-mcp/macro";

export interface AssessmentGlobalFactView {
	id: string;
	targetSchema: string;
	conceptDisplay: string;
	certainty?: string;
}

export interface AssessmentBranchView {
	branchId: string;
	name: string;
	status: string;
	hypothesisDisplay?: string;
	supportingCount: number;
	refutingCount: number;
	supportingConcepts: string[];
	refutingConcepts: string[];
	commandAlias?: string;
}

export interface AssessmentWorkspaceViewModel {
	workspaceId: string;
	branchCount: number;
	activeBranchId?: string;
	focused: boolean;
	loading: boolean;
	error: string | null;
	closeRequested: boolean;
	globalFacts: AssessmentGlobalFactView[];
	branches: AssessmentBranchView[];
}

export interface EvidenceFindingItem {
	rawText: string;
	display: string;
	conceptId?: string;
	certainty: "supporting" | "refuting";
	crossBranchEffects?: ImpliedBranchTransition[];
}

export interface ParsedDifferentialLine {
	rawInput: string;
	conceptDisplay: string;
	conceptId?: string;
	status: BranchStatus;
	macroName?: string;
	macroId?: string;
	supportingFindings: EvidenceFindingItem[];
	refutingFindings: EvidenceFindingItem[];
}

export function parseShorthandLine(
	line: string,
	syntaxProfile?: CommandSyntaxProfile,
	pinnedMacroId?: string,
): ParsedDifferentialLine {
	const trimmed = line.trim();
	if (!trimmed) {
		return {
			rawInput: "",
			conceptDisplay: "",
			status: "active",
			supportingFindings: [],
			refutingFindings: [],
		};
	}

	const supportingTokens =
		syntaxProfile?.evidenceSyntax?.supportingTokens ?? [];
	const refutingTokens = syntaxProfile?.evidenceSyntax?.refutingTokens ?? [];
	const listDelimiters = syntaxProfile?.evidenceSyntax?.listDelimiters ?? [];

	// Parse status alias leading verb
	const pinnedAction = Object.entries(
		syntaxProfile?.actionMacroMappings ?? {},
	).find(([, macroId]) => macroId === pinnedMacroId)?.[0] as
		| DirectCommandVerb
		| undefined;
	let status: BranchStatus =
		(pinnedAction && DIRECT_VERB_TO_BRANCH_STATUS[pinnedAction]) ?? "active";
	let actionVerb: DirectCommandVerb =
		pinnedAction ?? syntaxProfile?.implicitDefaultVerb ?? "branch";
	let remainingText = trimmed;

	const firstSpaceIdx = trimmed.indexOf(" ");
	if (firstSpaceIdx > 0 && syntaxProfile?.directCommandMappings) {
		const firstWord = trimmed.slice(0, firstSpaceIdx).toLowerCase();
		const mappedVerb = syntaxProfile.directCommandMappings[firstWord];
		if (mappedVerb && DIRECT_VERB_TO_BRANCH_STATUS[mappedVerb]) {
			actionVerb = mappedVerb;
			status = DIRECT_VERB_TO_BRANCH_STATUS[mappedVerb]!;
			remainingText = trimmed.slice(firstSpaceIdx + 1).trim();
		}
	}

	const macroName = `differential_${actionVerb.replace("_", "")}`;
	const macroId =
		pinnedMacroId ??
		syntaxProfile?.actionMacroMappings?.[actionVerb] ??
		`${actionVerb.replace("_", "-")}`;

	// Build delimiter regex for supporting and refuting evidence tokens with whitespace boundaries
	const buildDelimRegex = (tokens: readonly string[]) => {
		const escaped = tokens
			.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
			.join("|");
		return new RegExp(`(?:^|\\s+)(${escaped})(?:\\s+|$)`, "i");
	};

	const suppRegex = buildDelimRegex(supportingTokens);
	const refutRegex = buildDelimRegex(refutingTokens);

	// Split text into structural segments preserving multi-word expressions
	let hypothesisText = remainingText;
	const supportingFindings: EvidenceFindingItem[] = [];
	const refutingFindings: EvidenceFindingItem[] = [];

	// Find evidence split positions
	const findFirstMatch = (text: string) => {
		const suppMatch = text.match(suppRegex);
		const refutMatch = text.match(refutRegex);

		if (!suppMatch && !refutMatch) return null;
		if (
			suppMatch &&
			(!refutMatch || (suppMatch.index ?? 0) <= (refutMatch.index ?? 0))
		) {
			return { type: "supporting" as const, match: suppMatch };
		}
		return { type: "refuting" as const, match: refutMatch! };
	};

	const matchResult = findFirstMatch(remainingText);
	if (matchResult) {
		const matchIdx = matchResult.match.index ?? 0;
		hypothesisText = remainingText.slice(0, matchIdx).trim();

		let currentTail = remainingText
			.slice(matchIdx + matchResult.match[0].length)
			.trim();
		let currentType = matchResult.type;

		while (currentTail) {
			const nextMatch = findFirstMatch(currentTail);
			let segmentText = currentTail;
			if (nextMatch) {
				const nextIdx = nextMatch.match.index ?? 0;
				segmentText = currentTail.slice(0, nextIdx).trim();
				currentTail = currentTail
					.slice(nextIdx + nextMatch.match[0].length)
					.trim();
			} else {
				currentTail = "";
			}

			// Split segment by list delimiters
			const splitRegex = new RegExp(`[${listDelimiters.join("")}]`, "g");
			const items = segmentText
				.split(splitRegex)
				.map((item) => item.trim())
				.filter(Boolean);

			for (const item of items) {
				let mainText = item;
				const crossEffects: ImpliedBranchTransition[] = [];

				// Check for nested cross-branch directive in parentheses e.g. "normal d-dimer (r/o pe)" or "(rules out pe)"
				const directiveMatch = item.match(/\(([^)]+)\)$/);
				if (directiveMatch && directiveMatch[1]) {
					const matchIdx = directiveMatch.index ?? 0;
					mainText = item.slice(0, matchIdx).trim();
					const dirContent = directiveMatch[1].trim();
					const parts = dirContent.split(/\s+/);
					const verbCandidate = (parts[0] ?? "").toLowerCase();
					if (parts.length >= 2 && verbCandidate) {
						const targetBranch = parts.slice(1).join(" ");
						const transitionKind =
							(syntaxProfile &&
								syntaxProfile.directCommandMappings[verbCandidate]) ??
							(verbCandidate === "rules" &&
							(parts[1] ?? "").toLowerCase() === "out"
								? "rule_out"
								: null);

						if (transitionKind) {
							const target =
								verbCandidate === "rules" && parts[1]?.toLowerCase() === "out"
									? parts.slice(2).join(" ")
									: targetBranch;
							if (target) {
								crossEffects.push({
									targetBranch: target,
									transition:
										transitionKind === "rule_out" ? "rule_out" : "rule_out",
									rationale: dirContent,
								});
							}
						}
					}
				}

				const display = mainText
					.split(/\s+/)
					.map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
					.join(" ");

				const finding: EvidenceFindingItem = {
					rawText: item,
					display,
					certainty: currentType,
					crossBranchEffects:
						crossEffects.length > 0 ? crossEffects : undefined,
				};

				if (currentType === "supporting") supportingFindings.push(finding);
				else if (currentType === "refuting") refutingFindings.push(finding);
			}

			if (nextMatch) {
				currentType = nextMatch.type;
			}
		}
	}

	const conceptPart = hypothesisText || remainingText;
	const titleCased = conceptPart
		.trim()
		.split(/\s+/)
		.map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
		.join(" ");

	return {
		rawInput: trimmed,
		conceptDisplay: titleCased || "Unknown Condition",
		status,
		macroName,
		macroId,
		supportingFindings,
		refutingFindings,
	};
}

export async function resolveShorthandLine(
	line: string,
	syntaxProfile?: CommandSyntaxProfile,
	conceptLookup?: ConceptLookup,
	pinnedMacroId?: string,
): Promise<ParsedDifferentialLine> {
	const parsed = parseShorthandLine(line, syntaxProfile, pinnedMacroId);
	if (!conceptLookup || !parsed.rawInput) return parsed;

	const resolveText = async (text: string) => {
		try {
			const res = await resolveConceptValue(text, conceptLookup);
			if (res.value?.concept) {
				return {
					display: res.value.concept.display,
					conceptId: res.value.concept.conceptId,
				};
			}
		} catch {}
		return { display: text, conceptId: undefined };
	};

	const hypRes = await resolveText(parsed.conceptDisplay);
	if (hypRes.conceptId) {
		parsed.conceptDisplay = hypRes.display;
		parsed.conceptId = hypRes.conceptId;
	}

	for (const item of parsed.supportingFindings) {
		const itemRes = await resolveText(item.display);
		if (itemRes.conceptId) {
			item.display = itemRes.display;
			item.conceptId = itemRes.conceptId;
		}
	}

	for (const item of parsed.refutingFindings) {
		const itemRes = await resolveText(item.display);
		if (itemRes.conceptId) {
			item.display = itemRes.display;
			item.conceptId = itemRes.conceptId;
		}
	}

	return parsed;
}

export interface DeduplicatedLine {
	parsed: ParsedDifferentialLine;
	mergedCount: number;
	lineIndices: number[];
}

export interface ClinicalDifferentialProjectionData {
	readonly conceptDisplay: string;
	readonly conceptId?: string;
	readonly status: BranchStatus;
	readonly supportingFindings: readonly EvidenceFindingItem[];
	readonly refutingFindings: readonly EvidenceFindingItem[];
	readonly mergedCount: number;
	readonly lineIndices: readonly number[];
}

export function toClinicalDifferentialProjection(
	line: DeduplicatedLine,
	ownerExtensionId = "@stateful-mcp/clinical",
): ExtensionProjection {
	return {
		id: `clinical.differential.${line.parsed.macroId ?? line.parsed.conceptDisplay}`,
		ownerExtensionId,
		kind: "clinical.differential",
		data: {
			conceptDisplay: line.parsed.conceptDisplay,
			conceptId: line.parsed.conceptId,
			status: line.parsed.status,
			supportingFindings: line.parsed.supportingFindings,
			refutingFindings: line.parsed.refutingFindings,
			mergedCount: line.mergedCount,
			lineIndices: line.lineIndices,
		} satisfies ClinicalDifferentialProjectionData,
	};
}

export function createClinicalPinnedLineSeed(
	context: PinnedMacroLineContext,
	syntaxProfile?: CommandSyntaxProfile,
): string {
	const action = Object.entries(syntaxProfile?.actionMacroMappings ?? {}).find(
		(([, macroId]) => macroId === context.macroId),
	)?.[0];
	return `${action ?? context.macroName} `;
}

export function deduplicateParsedLines(
	parsedLines: ParsedDifferentialLine[],
): DeduplicatedLine[] {
	const map = new Map<string, DeduplicatedLine>();

	parsedLines.forEach((item, index) => {
		if (!item.rawInput.trim() || !item.conceptDisplay) return;
		const key = (item.conceptId ?? item.conceptDisplay).toLowerCase();
		const existing = map.get(key);

		if (existing) {
			existing.parsed = {
				...item,
				// Last-write-wins status updates
				status: item.status,
				supportingFindings: [
					...existing.parsed.supportingFindings,
					...item.supportingFindings,
				],
				refutingFindings: [
					...existing.parsed.refutingFindings,
					...item.refutingFindings,
				],
			};
			existing.mergedCount += 1;
			existing.lineIndices.push(index);
		} else {
			map.set(key, {
				parsed: { ...item },
				mergedCount: 1,
				lineIndices: [index],
			});
		}
	});

	return Array.from(map.values());
}

export function adaptWorkspaceSnapshotToViewModel(
	snapshot: WorkspaceSnapshot | null,
	loading: boolean,
	error: string | null,
	focused: boolean,
): AssessmentWorkspaceViewModel {
	if (!snapshot) {
		return {
			workspaceId: "",
			branchCount: 0,
			activeBranchId: undefined,
			focused,
			loading,
			error,
			closeRequested: false,
			globalFacts: [],
			branches: [],
		};
	}

	const globalFacts: AssessmentGlobalFactView[] = snapshot.globalFacts.map(
		(fact) => ({
			id: fact.factId,
			targetSchema: fact.targetSchema,
			conceptDisplay: fact.concept?.display ?? fact.certainty ?? "known",
			certainty: fact.certainty ?? undefined,
		}),
	);

	const branches: AssessmentBranchView[] = snapshot.branches.map((branch) => ({
		branchId: branch.branchId,
		name: branch.name,
		status: branch.status,
		hypothesisDisplay: branch.hypothesisConcept?.display,
		supportingCount: branch.supportingConcepts.length,
		refutingCount: branch.refutingConcepts.length,
		supportingConcepts: branch.supportingConcepts.map(
			(c) => c.display ?? c.conceptId ?? "",
		),
		refutingConcepts: branch.refutingConcepts.map(
			(c) => c.display ?? c.conceptId ?? "",
		),
		commandAlias: branch.commandAlias,
	}));

	return {
		workspaceId: snapshot.workspaceId,
		branchCount: branches.length,
		activeBranchId: snapshot.activeBranchId ?? undefined,
		focused,
		loading,
		error,
		closeRequested: snapshot.closeRequested ?? false,
		globalFacts,
		branches,
	};
}
