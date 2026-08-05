import {
	type MacroArgumentMatch,
	type MacroCaptureSpan,
	type MacroDefinition,
	parseMacroLine,
} from "@stateful-mcp/clinical";
import type { SyntaxProfile } from "@stateful-mcp/clinical/macros/macro-profile";

export interface MacroSlotProjection {
	macroId: string;
	macroVersion: number;
	argumentId: string;
	roleName: string;
	start: number;
	end: number;
	anchorStart?: number;
	anchorEnd?: number;
	friendlyText?: string;
	extractionPattern?: string;
	rawText: string;
	displayText: string;
	bindingSource?:
		| "named"
		| "positional"
		| "inferred"
		| "rule"
		| "friendly"
		| "accepted";
	status: "unbound" | "bound" | "invalid" | "locked";
	binding?: MacroSlotBinding;
	diagnostics: string[];
	occurrence?: number;
	formId?: string;
	captureSpans?: MacroCaptureSpan[];
}

export interface MacroSlotBinding {
	kind: "concept" | "custom-expression";
	conceptId: string;
	expressionId?: string;
	lookupTerm?: string;
	displayValue?: string;
	canonicalValue?: string;
}

export interface MacroLockState {
	argumentId: string;
	macroId: string;
	macroVersion: number;
	start: number;
	end: number;
	rawText?: string;
	lockedAtRevision: number;
	source: "explicit" | "accepted";
	binding?: MacroSlotBinding;
}

export function projectMacroSlots(
	draftText: string,
	definition: MacroDefinition | null | undefined,
	profile?: SyntaxProfile,
): MacroSlotProjection[] {
	if (!definition) return [];
	const parsed = parseMacroLine(draftText, 0, { definition, profile });
	if (!parsed?.matches?.length) return [];
	return parsed.matches.flatMap((match) => {
		const argument = definition.arguments.find(
			(candidate) => candidate.argumentId === match.argumentId,
		);
		if (!argument) return [];
		return [toProjection(draftText, definition, argument, match)];
	});
}

export function activeMacroSlot(
	projections: readonly MacroSlotProjection[],
	cursorOffset: number,
): MacroSlotProjection | undefined {
	return projections.find(
		(slot) => cursorOffset >= slot.start && cursorOffset <= slot.end,
	);
}

export function nextMacroSlot(
	projections: readonly MacroSlotProjection[],
	cursorOffset: number,
	direction: 1 | -1 = 1,
): MacroSlotProjection | undefined {
	const ordered = [...projections].sort(
		(left, right) => left.start - right.start,
	);
	if (!ordered.length) return undefined;
	if (direction > 0) {
		return ordered.find((slot) => slot.start > cursorOffset) ?? ordered[0];
	}
	return (
		[...ordered].reverse().find((slot) => slot.end < cursorOffset) ??
		ordered[ordered.length - 1]
	);
}

export function lockMacroSlot(
	projection: MacroSlotProjection,
	lockedAtRevision: number,
	source: MacroLockState["source"] = "explicit",
): MacroLockState {
	return {
		argumentId: projection.argumentId,
		macroId: projection.macroId,
		macroVersion: projection.macroVersion,
		start: projection.start,
		end: projection.end,
		rawText: projection.rawText,
		lockedAtRevision,
		source,
	};
}

export interface MacroLockLike {
	argumentId: string;
	macroId: string;
	macroVersion: number;
	start: number;
	end: number;
	rawText?: string;
	binding?: MacroSlotBinding;
}

export function applyMacroLocks(
	projections: readonly MacroSlotProjection[],
	locks: readonly MacroLockLike[],
	activeArgumentId?: string,
	draftText?: string,
	definition?: MacroDefinition | null,
): MacroSlotProjection[] {
	const projected = projections.map((projection) => {
		const lock = locks.find(
			(lock) =>
				lock.macroId === projection.macroId &&
				lock.macroVersion === projection.macroVersion &&
				lock.argumentId === projection.argumentId &&
				lock.start >= projection.start &&
				lock.end <= projection.end &&
				(!lock.rawText ||
					draftText === undefined ||
					draftText.slice(lock.start, lock.end) === lock.rawText),
		);
		const locked = lock !== undefined;
		return {
			...projection,
			...(lock
				? {
						start: lock.start,
						end: lock.end,
						rawText: lock.rawText ?? projection.rawText,
					}
				: {}),
			binding: locked ? lock?.binding : projection.binding,
			status: locked
				? "locked"
				: projection.argumentId === activeArgumentId
					? "bound"
					: projection.status,
		};
	});
	if (!definition) return projected;
	for (const lock of locks) {
		if (
			lock.rawText &&
			draftText !== undefined &&
			draftText.slice(lock.start, lock.end) !== lock.rawText
		)
			continue;
		if (
			projected.some(
				(slot) =>
					slot.argumentId === lock.argumentId &&
					slot.start === lock.start &&
					slot.end === lock.end,
			)
		)
			continue;
		const argument = definition.arguments.find(
			(candidate) => candidate.argumentId === lock.argumentId,
		);
		if (!argument || !lock.rawText || !lock.binding) continue;
		projected.push({
			macroId: definition.macroId,
			macroVersion: definition.version,
			argumentId: argument.argumentId,
			roleName: argument.roleName,
			start: lock.start,
			end: lock.end,
			rawText: lock.rawText,
			displayText: lock.binding.displayValue ?? lock.rawText,
			bindingSource: "accepted",
			status: "locked",
			diagnostics: [],
			binding: lock.binding,
		});
	}
	return projected.sort((left, right) => left.start - right.start);
}

function toProjection(
	draftText: string,
	definition: MacroDefinition,
	argument: MacroDefinition["arguments"][number],
	match: MacroArgumentMatch,
): MacroSlotProjection {
	const rawText = draftText.slice(match.extraction.start, match.extraction.end);
	return {
		macroId: definition.macroId,
		macroVersion: definition.version,
		argumentId: match.argumentId,
		roleName: argument.roleName,
		start: match.extraction.start,
		end: match.extraction.end,
		anchorStart: match.anchor?.start,
		anchorEnd: match.anchor?.end,
		friendlyText: match.friendlyText,
		extractionPattern: argument.extraction.patterns?.join("|"),
		rawText,
		displayText: rawText,
		bindingSource: match.source,
		status: "bound",
		diagnostics: [],
		occurrence: match.occurrence,
		formId: match.formId,
		captureSpans: match.captureSpans,
	};
}
