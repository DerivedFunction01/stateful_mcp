import { matchTemporalGrammar } from "../../setup/temporal-grammar-compiler";
import {
	assembleClinicalDateRange,
	type DateRangeSlotValues,
} from "../../values/date-range-assembler";
import type { MacroTargetOperation } from "../macro-plan";
import type {
	ChildExecutorContext,
	ChildExecutorResult,
	ChildMacroExecutor,
} from "./child-executor";
import { resolveChildInputSpan } from "./child-executor";

export class DateRangeChildExecutor implements ChildMacroExecutor {
	async execute(context: ChildExecutorContext): Promise<ChildExecutorResult> {
		const span = resolveChildInputSpan(context);
		if (!span || !span.rawValue.trim()) {
			return {
				operations: [],
				diagnostics: [
					`No input text found for child macro '${context.childDefinition.childMacroName}'`,
				],
			};
		}

		if (!context.compiledGrammar) {
			return {
				operations: [],
				diagnostics: [
					`No compiled temporal grammar provided for child macro '${context.childDefinition.childMacroName}'`,
				],
			};
		}

		const matchResult = matchTemporalGrammar(
			context.compiledGrammar,
			span.rawValue.trim(),
		);
		if (!matchResult.match) {
			return {
				operations: [],
				diagnostics: matchResult.diagnostics,
				sourceSpan:
					span.start !== undefined && span.end !== undefined
						? { start: span.start, end: span.end, rawValue: span.rawValue }
						: undefined,
			};
		}

		const parseTimestamp = (val: string) => {
			const ddmmyyyy = val.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
			if (ddmmyyyy)
				return `${ddmmyyyy[3]}-${ddmmyyyy[2]}-${ddmmyyyy[1]}T00:00:00.000Z`;
			return val;
		};

		const slots: DateRangeSlotValues = {};
		for (const [slotId, slotVal] of Object.entries(matchResult.match.slots)) {
			if (!slotVal) continue;
			if (slotId.includes("start")) {
				slots.start = {
					assertedTimestampUtc: parseTimestamp(slotVal),
					precisionLevel: "day",
				};
			} else if (slotId.includes("end")) {
				slots.end = {
					assertedTimestampUtc: parseTimestamp(slotVal),
					precisionLevel: "day",
				};
			} else if (slotId.includes("exclude")) {
				slots.excluded = [
					{
						start: {
							assertedTimestampUtc: parseTimestamp(slotVal),
							precisionLevel: "day",
						},
					},
				];
			} else if (slotId.includes("include")) {
				slots.included = [
					{
						start: {
							assertedTimestampUtc: parseTimestamp(slotVal),
							precisionLevel: "day",
						},
					},
				];
			}
		}

		const assembly = assembleClinicalDateRange(slots);
		if (!assembly.value || assembly.diagnostics.length > 0) {
			return {
				operations: [],
				diagnostics: assembly.diagnostics.map((d) => d.message),
				sourceSpan:
					span.start !== undefined && span.end !== undefined
						? { start: span.start, end: span.end, rawValue: span.rawValue }
						: undefined,
			};
		}

		const typedValue = {
			kind: "temporal" as const,
			temporalType: "date_range" as const,
			value: {
				kind: "date_range" as const,
				value: assembly.value,
			},
			rawText: span.rawValue,
			evidence: [{ source: "date_range_child_executor" }],
		};

		const childOperation: MacroTargetOperation = {
			operationId: `op_child_${context.childDefinition.childMacroName}`,
			groupId: context.groupId,
			macroDefinitionId:
				context.childMacroDefinition?.macroId ??
				context.childDefinition.childMacroName,
			targetSchema: context.parentDefinition.root.targetSchema,
			targetPath: context.childDefinition.parentTargetPath,
			value: typedValue,
			rawValue: span.rawValue,
			sourceLine: context.sourceLine ?? 0,
			evidence: [{ source: "child_executor:date_range" }],
		};

		return {
			value: typedValue,
			operations: [childOperation],
			diagnostics: [],
			sourceSpan:
				span.start !== undefined && span.end !== undefined
					? { start: span.start, end: span.end, rawValue: span.rawValue }
					: undefined,
		};
	}
}
