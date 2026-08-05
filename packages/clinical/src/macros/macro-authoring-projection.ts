import type { MacroDefinition } from "./macro-definition";
import type { SyntaxProfile } from "./macro-profile";
import {
	activeMacroSlot,
	activeMacroTemplateArgument,
	type MacroSlotProjection,
} from "./macro-slots";

export interface MacroExpressionCandidate {
	id: string;
	term: string;
	lookupTerm?: string;
	conceptId?: string;
}

export function selectUnambiguousExpression(
	expressions: readonly MacroExpressionCandidate[],
	input: string,
): MacroExpressionCandidate | undefined {
	const normalizedInput = input.trim().toLocaleLowerCase();
	if (!normalizedInput) return undefined;
	const matches = expressions
		.filter((candidate) => {
			if (!candidate.conceptId) return false;
			const term = (candidate.lookupTerm ?? candidate.term).toLocaleLowerCase();
			return (
				term.length > 0 &&
				normalizedInput.length >= term.length &&
				normalizedInput.startsWith(term) &&
				/\s|$/.test(normalizedInput[term.length] ?? "")
			);
		})
		.sort(
			(left, right) =>
				(right.lookupTerm ?? right.term).length -
				(left.lookupTerm ?? left.term).length,
		);
	const expression = matches[0];
	if (!expression) return undefined;
	const longerContinuation = expressions.some((candidate) => {
		const term = (candidate.lookupTerm ?? candidate.term).toLocaleLowerCase();
		return term.startsWith(`${normalizedInput} `) && term !== normalizedInput;
	});
	return longerContinuation ? undefined : expression;
}

export interface MacroArgumentStatus {
	name: string;
	status: "locked" | "broken" | "remaining";
	message?: string;
}

export function isMacroSlotResolved(
	slot: MacroSlotProjection,
	definition: MacroDefinition,
): boolean {
	const argument = definition.arguments.find(
		(candidate) => candidate.argumentId === slot.argumentId,
	);
	const isConcept =
		argument?.extraction.kind === "concept" ||
		argument?.extraction.kind === "concept_array";
	return (
		slot.status === "locked" ||
		Boolean(slot.binding) ||
		(!isConcept && slot.status !== "invalid")
	);
}

export function getMacroArgumentStatuses(
	definition: MacroDefinition,
	slots: readonly MacroSlotProjection[],
): MacroArgumentStatus[] {
	return definition.arguments.map((argument) => {
		const slot =
			slots.find(
				(candidate) =>
					candidate.argumentId === argument.argumentId &&
					isMacroSlotResolved(candidate, definition),
			) ??
			slots.find((candidate) => candidate.argumentId === argument.argumentId);
		if (slot && isMacroSlotResolved(slot, definition)) {
			return slot.diagnostics?.length
				? {
						name: argument.name,
						status: "broken" as const,
						message: slot.diagnostics[0],
					}
				: { name: argument.name, status: "locked" as const };
		}
		return { name: argument.name, status: "remaining" as const };
	});
}

export function findNextMacroChild(
	children: readonly MacroDefinition[],
	slots: readonly MacroSlotProjection[],
): MacroDefinition | undefined {
	return children.find((child) => {
		const childSlots = slots.filter((slot) => slot.macroId === child.macroId);
		const allLocked =
			child.arguments.length > 0 &&
			child.arguments.every((argument) =>
				childSlots.some(
					(slot) =>
						slot.argumentId === argument.argumentId && slot.status === "locked",
				),
			);
		return !allLocked;
	});
}

export function getActiveMacroArgumentId(
	draftText: string,
	cursorOffset: number,
	slots: readonly MacroSlotProjection[],
	definition: MacroDefinition | null | undefined,
	profile?: Pick<SyntaxProfile, "macroStartToken">,
): string | undefined {
	const activeSlot = activeMacroSlot(slots, cursorOffset);
	const isExplicit =
		activeSlot &&
		(activeSlot.status === "locked" ||
			Boolean(activeSlot.binding) ||
			activeSlot.bindingSource === "named" ||
			activeSlot.bindingSource === "friendly" ||
			activeSlot.bindingSource === "rule" ||
			activeSlot.bindingSource === "accepted");
	if (activeSlot && isExplicit) return activeSlot.argumentId;
	const templateArgumentId = activeMacroTemplateArgument(
		draftText,
		cursorOffset,
		definition,
		profile,
	);
	return slots.some(
		(slot) =>
			slot.argumentId === templateArgumentId &&
			(slot.status === "locked" || Boolean(slot.binding)),
	)
		? undefined
		: templateArgumentId;
}
