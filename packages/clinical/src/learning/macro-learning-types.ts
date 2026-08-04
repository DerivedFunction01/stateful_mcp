import type { MacroArgumentBinding } from "../macros/macro-binding";
import type { MacroDefinition } from "../macros/macro-definition";
import type { TypedValue } from "../values/typed-value";
import { computeValueInBase } from "../values/utils/measurement-conversion";
import type {
	LearningObservationMode,
	LearningOutcome,
	LearningScope,
} from "./interfaces";

export interface MacroLearningFeature {
	key:
		| "argument.kind"
		| "measurement.unitAnchor"
		| "measurement.sourceUnit"
		| "measurement.normalizedUnit"
		| "measurement.value"
		| "value.enum"
		| "value.concept"
		| "qualifier.parentArgument";
	value: string | null;
	numericalValue: number | null;
}

export interface MacroLearningTraceArgument {
	argumentId: string;
	roleName: string;
	position?: number;
	rawTerm: string;
	parsedValue: TypedValue;
	source: MacroArgumentBinding["source"];
	start?: number;
	end?: number;
	features: MacroLearningFeature[];
	parentArgumentId?: string;
}

export interface MacroLearningTrace {
	macroId: string;
	macroVersion: number;
	macroName: string;
	arguments: MacroLearningTraceArgument[];
	personnelId?: string;
	profileId?: string;
	sessionId?: string;
	scope?: LearningScope;
	observationMode?: LearningObservationMode;
	outcome?: LearningOutcome;
	correlationId?: string;
}

export interface MacroLearningTraceContext {
	personnelId?: string;
	profileId?: string;
	sessionId?: string;
	observationMode?: LearningObservationMode;
	outcome?: LearningOutcome;
	correlationId?: string;
}

export interface MacroLearningCandidate {
	argumentId: string;
	value?: TypedValue;
	features?: MacroLearningFeature[];
}

export interface MacroLearningRankingContext {
	macroId: string;
	macroVersion: number;
	previousSlot?: string;
	filledSlots: readonly string[];
	personnelId?: string;
	observationModes?: readonly LearningObservationMode[];
}

export interface MacroLearningRankedCandidate<
	T extends MacroLearningCandidate = MacroLearningCandidate,
> {
	candidate: T;
	score: number;
	features: Record<string, number>;
}

export type MacroLearningDefinition = Pick<
	MacroDefinition,
	"macroId" | "macroName" | "version" | "arguments"
>;

export function buildMacroLearningFeatures(
	value: TypedValue,
): MacroLearningFeature[] {
	const features: MacroLearningFeature[] = [
		{ key: "argument.kind", value: value.kind, numericalValue: null },
	];
	if (value.kind === "measurement") {
		const normalized = computeValueInBase(
			value.dimension as Parameters<typeof computeValueInBase>[0],
			value.unit,
			value.magnitude,
		);
		features.push(
			{
				key: "measurement.unitAnchor",
				value: value.dimension,
				numericalValue: null,
			},
			{
				key: "measurement.sourceUnit",
				value: value.unit,
				numericalValue: null,
			},
			{
				key: "measurement.normalizedUnit",
				value: value.normalized?.unit ?? value.unit,
				numericalValue: null,
			},
			{
				key: "measurement.value",
				value: value.normalized?.unit ?? value.unit,
				numericalValue:
					normalized !== undefined && Number.isFinite(normalized)
						? normalized
						: null,
			},
		);
	} else if (value.kind === "scalar" && typeof value.value === "number") {
		features.push({
			key: "measurement.value",
			value: null,
			numericalValue: value.value,
		});
	} else if (value.kind === "enum") {
		features.push({
			key: "value.enum",
			value: value.value,
			numericalValue: null,
		});
	} else if (value.kind === "concept") {
		features.push({
			key: "value.concept",
			value: value.concept.conceptId ?? value.concept.display ?? null,
			numericalValue: null,
		});
	}
	return features;
}
