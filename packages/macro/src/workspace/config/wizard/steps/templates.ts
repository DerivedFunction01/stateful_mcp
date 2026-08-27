import type { ValueAuthoringProfileDto } from "@stateful-mcp/macro-protocol";
import {
	analyzeFormatTemplate,
	DATE_TIME_TOKENS,
	type TemplateTokenSegment,
} from "../../../../values/token-spec";
import type { WizardDateTimeFormatDto } from "../collections";
import {
	appendEntry,
	getCollectionEntries,
	removeEntry,
	setEntryEnabled,
	setEntryPriority,
	updateEntry,
} from "../collections";

/**
 * Date-time base-template step: format list edits keyed by stable ID with
 * priority ordering, enable/disable, and verbatim token-source retention.
 * Source analysis is computed locally via macro's template analyzer and never
 * transported.
 */
export function createDateTimeFormat(
	profile: ValueAuthoringProfileDto,
	input: Pick<WizardDateTimeFormatDto, "id" | "kind" | "source"> &
		Partial<WizardDateTimeFormatDto>,
): ValueAuthoringProfileDto {
	return appendEntry(profile, "dateTimeFormats", input);
}

export function editDateTimeFormatSource(
	profile: ValueAuthoringProfileDto,
	id: string,
	source: string,
): ValueAuthoringProfileDto {
	return updateEntry(profile, "dateTimeFormats", id, { source });
}

export function setDateTimeFormatPriority(
	profile: ValueAuthoringProfileDto,
	id: string,
	priority: number | null,
): ValueAuthoringProfileDto {
	return setEntryPriority(profile, "dateTimeFormats", id, priority);
}

export function setDateTimeFormatEnabled(
	profile: ValueAuthoringProfileDto,
	id: string,
	enabled: boolean,
): ValueAuthoringProfileDto {
	return setEntryEnabled(profile, "dateTimeFormats", id, enabled);
}

export function removeDateTimeFormat(
	profile: ValueAuthoringProfileDto,
	id: string,
): ValueAuthoringProfileDto {
	return removeEntry(profile, "dateTimeFormats", id);
}

/** Ordered format IDs; priorities ascending, ties keep insertion order. */
export function listOrderedFormatIds(
	profile: ValueAuthoringProfileDto | null,
): readonly string[] {
	const entries = getCollectionEntries(profile, "dateTimeFormats");
	return entries
		.map((entry, index) => ({
			id: entry.id,
			key:
				typeof (entry as WizardDateTimeFormatDto).parserPriority === "number"
					? ((entry as WizardDateTimeFormatDto).parserPriority as number)
					: Number.POSITIVE_INFINITY,
			index,
		}))
		.sort((left, right) =>
			left.key === right.key ? left.index - right.index : left.key - right.key,
		)
		.map((entry) => entry.id);
}

export interface DateTimeTemplateView extends WizardDateTimeFormatDto {}

/** Local token-source analysis projection (literal/known/unknown segments). */
export function analyzeDateTimeSource(source: string) {
	const analysis = analyzeFormatTemplate(source, DATE_TIME_TOKENS);
	return {
		template: analysis.template,
		tokens: [...analysis.tokens],
		segments: analysis.segments.map((segment: TemplateTokenSegment) => ({
			...segment,
		})),
		unknownTokens: analysis.unknownTokens.map(
			(segment: TemplateTokenSegment) => ({ ...segment }),
		),
	};
}

export interface TemplateFormatRow {
	readonly format: WizardDateTimeFormatDto;
	readonly analysis: ReturnType<typeof analyzeDateTimeSource>;
	readonly orderIndex: number;
}

export function projectTemplateRows(
	profile: ValueAuthoringProfileDto | null,
): readonly TemplateFormatRow[] {
	const orderedIds = listOrderedFormatIds(profile);
	return orderedIds.flatMap((id, orderIndex) => {
		const entry = getCollectionEntries(profile, "dateTimeFormats").find(
			(candidate) => candidate.id === id,
		) as WizardDateTimeFormatDto | undefined;
		if (!entry) return [];
		return [
			{
				format: entry,
				analysis: analyzeDateTimeSource(entry.source ?? ""),
				orderIndex,
			},
		];
	});
}
