import type {
	MacroArgumentMatch,
	MacroCaptureSpan,
	MacroSpan,
} from "./macro-binding";
import type {
	CommandMacroTemplatePart,
	MacroArgumentForm,
	MacroDefinition,
} from "./macro-definition";

export interface MacroTemplateValidationIssue {
	code:
		| "UNKNOWN_TEMPLATE_ARGUMENT"
		| "DUPLICATE_TEMPLATE_OCCURRENCE"
		| "INVALID_TEMPLATE_FORM";
	message: string;
	argumentId?: string;
}

export function validateMacroAuthoringTemplates(
	definition: MacroDefinition,
): MacroTemplateValidationIssue[] {
	const issues: MacroTemplateValidationIssue[] = [];
	const argumentsById = new Set(
		definition.arguments.map((argument) => argument.argumentId),
	);
	const forms = [
		...(definition.authoringTemplates ?? []).map((template, index) => ({
			formId: `template:${index}`,
			argumentId: undefined,
			template,
		})),
		...definition.arguments.flatMap((argument) =>
			(argument.forms ?? []).map((form) => form),
		),
	];

	for (const form of forms) {
		const slots = form.template.parts.filter(
			(part): part is Extract<CommandMacroTemplatePart, { kind: "slot" }> =>
				part.kind === "slot",
		);
		if (slots.length === 0) {
			issues.push({
				code: "INVALID_TEMPLATE_FORM",
				message: `Template form '${form.formId}' must contain a slot`,
			});
			continue;
		}
		const occurrences = new Set<string>();
		for (const slot of slots) {
			if (!argumentsById.has(slot.argumentId)) {
				issues.push({
					code: "UNKNOWN_TEMPLATE_ARGUMENT",
					argumentId: slot.argumentId,
					message: `Template references unknown argument '${slot.argumentId}'`,
				});
			}
			const key = `${slot.argumentId}:${slot.occurrence}`;
			if (occurrences.has(key)) {
				issues.push({
					code: "DUPLICATE_TEMPLATE_OCCURRENCE",
					argumentId: slot.argumentId,
					message: `Template repeats occurrence '${key}'`,
				});
			}
			occurrences.add(key);
		}
	}
	return issues;
}

export function matchFriendlyMacroForms(
	raw: string,
	bodyStart: number,
	definition: MacroDefinition,
): MacroArgumentMatch[] {
	const candidates: MacroArgumentMatch[] = [];
	for (const form of definitionForms(definition)) {
		candidates.push(...matchForm(raw, bodyStart, form, definition));
	}
	return resolveMacroArgumentMatches(candidates, definition);
}

export function resolveMacroArgumentMatches(
	matches: readonly MacroArgumentMatch[],
	definition: MacroDefinition,
): MacroArgumentMatch[] {
	const formById = new Map<string, MacroArgumentForm>();
	for (const form of definitionForms(definition))
		formById.set(form.formId, form);
	return [...matches]
		.sort((left, right) => {
			const leftForm = left.formId ? formById.get(left.formId) : undefined;
			const rightForm = right.formId ? formById.get(right.formId) : undefined;
			return (
				(rightForm?.precedence ?? 0) - (leftForm?.precedence ?? 0) ||
				(left.formId ?? "").localeCompare(right.formId ?? "")
			);
		})
		.filter(
			(candidate, index, all) =>
				!all
					.slice(0, index)
					.some(
						(winner) =>
							overlaps(candidate.extraction, winner.extraction) &&
							!isCompatible(candidate, winner, formById),
					),
		)
		.sort((left, right) => left.extraction.start - right.extraction.start);
}

function matchForm(
	raw: string,
	bodyStart: number,
	form: MacroArgumentForm,
	definition: MacroDefinition,
): MacroArgumentMatch[] {
	const slots = form.template.parts.filter(
		(part): part is Extract<CommandMacroTemplatePart, { kind: "slot" }> =>
			part.kind === "slot",
	);
	if (!slots.length) return [];
	const groupNames = slots.map((_, index) => `__macro_slot_${index}`);
	const patternAlternatives = slots.map(
		(slot) =>
			definition.arguments.find(
				(argument) => argument.argumentId === slot.argumentId,
			)?.extraction.patterns ?? [],
	);
	if (patternAlternatives.some((patterns) => patterns.length === 0)) return [];
	const results: MacroArgumentMatch[] = [];
	for (const patterns of cartesian(patternAlternatives)) {
		let expression: RegExp;
		try {
			expression = new RegExp(
				form.template.parts
					.map((part) => {
						if (part.kind === "literal") return escapeRegex(part.text);
						const index = slots.indexOf(part);
						return `(?<${groupNames[index]}>${patterns[index]})`;
					})
					.join(""),
				"idg",
			);
		} catch {
			continue;
		}
		for (const match of execAll(expression, raw.slice(bodyStart))) {
			if (!match.indices) continue;
			const matchStart = bodyStart + match.index;
			for (const [index, slot] of slots.entries()) {
				const span = match.indices.groups?.[groupNames[index]!];
				if (!span) continue;
				const extractionStart = bodyStart + span[0];
				const extractionEnd = bodyStart + span[1];
				const anchorStart = matchStart;
				results.push({
					argumentId: slot.argumentId,
					occurrence: slot.occurrence,
					formId: form.formId,
					source: "friendly",
					anchor: { start: anchorStart, end: extractionStart },
					extraction: { start: extractionStart, end: extractionEnd },
					friendlyText: raw.slice(anchorStart, extractionStart),
					rawValue: raw.slice(extractionStart, extractionEnd),
					captures: filteredCaptures(match, groupNames),
					captureSpans: captureSpans(match, bodyStart, groupNames),
				});
			}
		}
	}
	return results;
}

function definitionForms(definition: MacroDefinition): MacroArgumentForm[] {
	const forms = definition.arguments.flatMap(
		(argument) => argument.forms ?? [],
	);
	for (const [index, template] of (
		definition.authoringTemplates ?? []
	).entries()) {
		const part = template.parts.find((candidate) => candidate.kind === "slot");
		if (part?.kind !== "slot") continue;
		forms.push({
			formId: `template:${index}:${part.argumentId}:${part.occurrence}`,
			kind: "friendly",
			argumentId: part.argumentId,
			template,
		});
	}
	return forms;
}

function cartesian<T>(values: readonly (readonly T[])[]): T[][] {
	return values.reduce<T[][]>(
		(results, current) =>
			results.flatMap((prefix) => current.map((value) => [...prefix, value])),
		[[]],
	);
}

function execAll(expression: RegExp, text: string): RegExpExecArray[] {
	const matches: RegExpExecArray[] = [];
	let match = expression.exec(text);
	while (match !== null) {
		matches.push(match);
		if (match[0].length === 0) {
			expression.lastIndex += 1;
		}
		match = expression.exec(text); // Re-assign at the end of the loop
	}
	return matches;
}

function captureSpans(
	match: RegExpExecArray,
	offset: number,
	excludedNames: readonly string[],
): MacroCaptureSpan[] {
	return Object.entries(match.groups ?? {}).flatMap(([name, value]) => {
		if (excludedNames.includes(name)) return [];
		const span = match.indices?.groups?.[name];
		return span
			? [{ name, value, start: offset + span[0], end: offset + span[1] }]
			: [];
	});
}

function filteredCaptures(
	match: RegExpExecArray,
	excludedNames: readonly string[],
): Record<string, string | undefined> {
	return Object.fromEntries(
		Object.entries(match.groups ?? {}).filter(
			([name]) => !excludedNames.includes(name),
		),
	);
}

function isCompatible(
	left: MacroArgumentMatch,
	right: MacroArgumentMatch,
	forms: Map<string, MacroArgumentForm>,
): boolean {
	const leftForm = left.formId ? forms.get(left.formId) : undefined;
	return leftForm?.compatibility?.includes(right.formId ?? "") ?? false;
}

function overlaps(left: MacroSpan, right: MacroSpan): boolean {
	return left.start < right.end && right.start < left.end;
}

function escapeRegex(text: string): string {
	return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
