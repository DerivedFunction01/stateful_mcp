import type { MacroCaptureSpan, MacroSpan } from "../contracts/input";
import type { MacroSpec } from "../contracts/macro";
import type {
	MacroArgumentForm,
	MacroArgumentMatch,
	MacroAuthoringTemplatePart,
} from "../contracts/matching";

export interface TemplateValidationIssue {
	code:
		| "UNKNOWN_TEMPLATE_ARGUMENT"
		| "DUPLICATE_TEMPLATE_OCCURRENCE"
		| "INVALID_TEMPLATE_FORM";
	message: string;
	argumentId?: string;
}

export function validateMacroTemplates(
	spec: MacroSpec,
): TemplateValidationIssue[] {
	const issues: TemplateValidationIssue[] = [];
	const argumentIds = new Set(
		spec.arguments.map((argument) => argument.argumentId),
	);
	for (const form of definitionForms(spec)) {
		const slots = form.template.parts.filter(isSlot);
		if (!slots.length) {
			issues.push({
				code: "INVALID_TEMPLATE_FORM",
				message: `Template form '${form.formId}' must contain a slot`,
			});
			continue;
		}
		const occurrences = new Set<string>();
		for (const slot of slots) {
			if (!argumentIds.has(slot.argumentId)) {
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
	spec: MacroSpec,
): MacroArgumentMatch[] {
	const results: MacroArgumentMatch[] = [];
	for (const form of definitionForms(spec)) {
		results.push(...matchForm(raw, bodyStart, form, spec));
	}
	return resolveMacroArgumentMatches(results, spec);
}

export function resolveMacroArgumentMatches(
	matches: readonly MacroArgumentMatch[],
	spec: MacroSpec,
): MacroArgumentMatch[] {
	const forms = new Map(
		definitionForms(spec).map((form) => [form.formId, form]),
	);
	return [...matches]
		.sort((left, right) => {
			const leftForm = left.formId ? forms.get(left.formId) : undefined;
			const rightForm = right.formId ? forms.get(right.formId) : undefined;
			return (
				(right.priority ?? rightForm?.precedence ?? 0) -
					(left.priority ?? leftForm?.precedence ?? 0) ||
				right.extraction.end -
					right.extraction.start -
					(left.extraction.end - left.extraction.start) ||
				(left.formId ?? "").localeCompare(right.formId ?? "")
			);
		})
		.filter(
			(candidate, index, all) =>
				!all
					.slice(0, index)
					.some(
						(winner) =>
							spansOverlap(candidate.extraction, winner.extraction) &&
							!isCompatible(candidate, winner, forms),
					),
		)
		.sort((left, right) => left.extraction.start - right.extraction.start);
}

function matchForm(
	raw: string,
	bodyStart: number,
	form: MacroArgumentForm,
	spec: MacroSpec,
): MacroArgumentMatch[] {
	const slots = form.template.parts.filter(isSlot);
	if (!slots.length) return [];
	const patterns = slots.map((slot) => {
		const argument = spec.arguments.find(
			(candidate) => candidate.argumentId === slot.argumentId,
		);
		return argument?.matcher
			? asMatchers(argument.matcher)
					.filter((matcher) => matcher.kind === "pattern")
					.map((matcher) => typePattern(matcher.pattern))
			: [];
	});
	if (patterns.some((values) => values.length === 0)) return [];

	const results: MacroArgumentMatch[] = [];
	for (const combination of cartesian(patterns)) {
		const groupNames = slots.map((_, index) => `__macro_slot_${index}`);
		let expression: RegExp;
		try {
			expression = new RegExp(
				form.template.parts
					.map((part) => {
						if (part.kind === "literal") return escapeRegex(part.text);
						const index = slots.indexOf(part);
						return `(?<${groupNames[index]}>${combination[index]})`;
					})
					.join(""),
				"gid",
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
				const start = bodyStart + span[0];
				const end = bodyStart + span[1];
				results.push({
					argumentId: slot.argumentId,
					occurrence: slot.occurrence,
					formId: form.formId,
					source: "friendly",
					anchor: { start: matchStart, end: start },
					extraction: { start, end },
					friendlyText: raw.slice(matchStart, start),
					rawValue: raw.slice(start, end),
					captures: filteredCaptures(match, groupNames),
					captureSpans: captureSpans(match, bodyStart, groupNames),
					matchKind: "pattern",
				});
			}
		}
	}
	return results;
}

function definitionForms(spec: MacroSpec): MacroArgumentForm[] {
	const forms = spec.arguments.flatMap((argument) => argument.forms ?? []);
	for (const [index, template] of (spec.authoringTemplates ?? []).entries()) {
		const slot = template.parts.find(isSlot);
		if (slot) {
			forms.push({
				formId: `template:${index}:${slot.argumentId}:${slot.occurrence}`,
				kind: "friendly",
				argumentId: slot.argumentId,
				template,
			});
		}
	}
	return forms;
}

function isSlot(
	part: MacroAuthoringTemplatePart,
): part is Extract<MacroAuthoringTemplatePart, { kind: "slot" }> {
	return part.kind === "slot";
}

function asMatchers(
	matcher: NonNullable<MacroSpec["arguments"][number]["matcher"]>,
) {
	return Array.isArray(matcher) ? matcher : [matcher];
}

function typePattern(pattern: string | RegExp): string {
	return typeof pattern === "string" ? pattern : pattern.source;
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
	while (match) {
		matches.push(match);
		if (match[0].length === 0) expression.lastIndex += 1;
		match = expression.exec(text);
	}
	return matches;
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

function isCompatible(
	left: MacroArgumentMatch,
	right: MacroArgumentMatch,
	forms: Map<string, MacroArgumentForm>,
): boolean {
	const leftForm = left.formId ? forms.get(left.formId) : undefined;
	const rightForm = right.formId ? forms.get(right.formId) : undefined;
	return Boolean(
		leftForm?.compatibility?.includes(right.formId ?? "") ||
			rightForm?.compatibility?.includes(left.formId ?? ""),
	);
}

function spansOverlap(left: MacroSpan, right: MacroSpan): boolean {
	return left.start < right.end && right.start < left.end;
}

function escapeRegex(text: string): string {
	return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
