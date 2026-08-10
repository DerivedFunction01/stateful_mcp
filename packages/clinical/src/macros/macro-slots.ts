import type {
	MacroArgumentMatch,
	MacroArgumentSource,
	MacroCaptureSpan,
} from "./macro-binding";
import type { MacroDefinition as Definition } from "./macro-definition";
import { parseMacroLine } from "./macro-input-parser";
import type { SyntaxProfile } from "./macro-profile";

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
	bindingSource?: MacroArgumentSource;
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

export interface MacroLockSuggestion {
	label: string;
	value?: string;
	conceptId?: string;
	expressionId?: string;
	lookupTerm?: string;
}

export function projectMacroSlots(
	draftText: string,
	definition: Definition | null | undefined,
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

export function activeMacroTemplateArgument(
	draftText: string,
	cursorOffset: number,
	definition: Definition | null | undefined,
	profile?: Pick<SyntaxProfile, "macroStartToken">,
): string | undefined {
	if (!definition?.authoringTemplates?.length) return undefined;
	const marker = profile?.macroStartToken ?? "^";
	const leading = draftText.search(/\S/);
	if (leading < 0 || !draftText.startsWith(marker, leading)) return undefined;
	const nameStart = leading + marker.length;
	const nameEnd = scanUntilWhitespace(draftText, nameStart);
	if (!draftText.slice(nameStart, nameEnd)) return undefined;
	const bodyStart = skipWhitespace(draftText, nameEnd);
	const body = draftText.slice(
		bodyStart,
		Math.min(cursorOffset, draftText.length),
	);

	for (const template of definition.authoringTemplates) {
		let bodyOffset = 0;
		for (let index = 0; index < template.parts.length; index += 1) {
			const part = template.parts[index]!;
			if (part.kind === "literal") {
				if (!body.startsWith(part.text, bodyOffset)) break;
				bodyOffset += part.text.length;
				continue;
			}
			const nextLiteral = template.parts
				.slice(index + 1)
				.find((candidate) => candidate.kind === "literal");
			if (!nextLiteral || nextLiteral.kind !== "literal")
				return part.argumentId;
			const nextLiteralOffset = body.indexOf(nextLiteral.text, bodyOffset);
			if (nextLiteralOffset < 0) return part.argumentId;
			bodyOffset = nextLiteralOffset + nextLiteral.text.length;
		}
	}
	return undefined;
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
	if (direction > 0)
		return ordered.find((slot) => slot.start > cursorOffset) ?? ordered[0];
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

export function createExplicitMacroLock(
	projection: MacroSlotProjection,
	suggestion?: MacroLockSuggestion,
): MacroLockLike & { source: "explicit" } {
	return {
		argumentId: projection.argumentId,
		macroId: projection.macroId,
		macroVersion: projection.macroVersion,
		start: projection.start,
		end: projection.end,
		rawText: projection.rawText,
		source: "explicit",
		binding: suggestion?.conceptId
			? {
					kind: suggestion.expressionId ? "custom-expression" : "concept",
					conceptId: suggestion.conceptId,
					expressionId: suggestion.expressionId,
					lookupTerm: suggestion.lookupTerm,
					displayValue: suggestion.label,
				}
			: undefined,
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

export function shiftMacroLocksForInsertion<T extends MacroLockLike>(
	locks: readonly T[],
	cursorOffset: number,
	insertedLength: number,
): T[] {
	return locks.flatMap((lock) => {
		if (cursorOffset > lock.start && cursorOffset < lock.end) return [];
		if (cursorOffset <= lock.start) {
			return [
				{
					...lock,
					start: lock.start + insertedLength,
					end: lock.end + insertedLength,
				},
			];
		}
		return [lock];
	});
}

export function shiftMacroLocksForDeletion<T extends MacroLockLike>(
	locks: readonly T[],
	deleteStart: number,
	deleteEnd: number,
): T[] {
	return locks.flatMap((lock) => {
		if (deleteStart < lock.end && deleteEnd > lock.start) return [];
		if (lock.start >= deleteEnd) {
			return [
				{
					...lock,
					start: lock.start - (deleteEnd - deleteStart),
					end: lock.end - (deleteEnd - deleteStart),
				},
			];
		}
		return [lock];
	});
}

export function removeMacroLock<T extends MacroLockLike>(
	locks: readonly T[],
	target: Pick<MacroLockLike, "argumentId" | "start" | "end">,
): T[] {
	return locks.filter(
		(lock) =>
			lock.argumentId !== target.argumentId ||
			lock.start !== target.start ||
			lock.end !== target.end,
	);
}

export function upsertMacroLock<T extends MacroLockLike>(
	locks: readonly T[],
	lock: T,
): T[] {
	const existingIndex = locks.findIndex(
		(candidate) =>
			candidate.macroId === lock.macroId &&
			candidate.macroVersion === lock.macroVersion &&
			candidate.start === lock.start &&
			candidate.argumentId === lock.argumentId,
	);
	if (existingIndex < 0) return [...locks, lock];
	if (locks[existingIndex]?.rawText === lock.rawText) return locks as T[];
	const next = [...locks];
	next[existingIndex] = lock;
	return next;
}

export function applyMacroLocks(
	projections: readonly MacroSlotProjection[],
	locks: readonly MacroLockLike[],
	activeArgumentId?: string,
	draftText?: string,
	definition?: Definition | null,
): MacroSlotProjection[] {
	const projected = projections.map((projection) => {
		const lock = locks.find(
			(candidate) =>
				candidate.macroId === projection.macroId &&
				candidate.macroVersion === projection.macroVersion &&
				candidate.argumentId === projection.argumentId &&
				candidate.start >= projection.start &&
				candidate.end <= projection.end &&
				(!candidate.rawText ||
					draftText === undefined ||
					draftText.slice(candidate.start, candidate.end) ===
						candidate.rawText),
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
	definition: Definition,
	argument: Definition["arguments"][number],
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

function scanUntilWhitespace(text: string, start: number): number {
	let index = start;
	while (index < text.length && !/\s/.test(text[index]!)) index += 1;
	return index;
}

function skipWhitespace(text: string, start: number): number {
	let index = start;
	while (index < text.length && /\s/.test(text[index]!)) index += 1;
	return index;
}
