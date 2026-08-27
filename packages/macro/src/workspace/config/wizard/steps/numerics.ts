import type { ValueAuthoringProfileDto } from "@stateful-mcp/macro-protocol";
import { NUMERIC_FORMS, type NumericForm } from "../../../../values/numeric";
import type { NumberWordScaleDraft } from "../collections";
import {
	type NumericOptionKey,
	setNumberWordAtom,
	setNumberWordScales,
	setNumericOption,
	toggleNumericForm,
} from "../collections";

/**
 * Numeric/lexicon step editing model over `values.numeric.*` canonical fields
 * plus number-word atoms/scales. Edits return new profile objects; live
 * examples schedule transport previews and never parse locally.
 */
export interface NumericLexiconView {
	readonly decimalSeparator: string | null;
	readonly thousandsSeparator: string | null;
	readonly allowedForms: readonly NumericForm[];
	readonly allowNegative: boolean | null;
	readonly allowFractions: boolean | null;
	readonly allowMixedFractions: boolean | null;
	readonly allowScientific: boolean | null;
	readonly atoms: Readonly<Record<string, string>>;
	readonly scales: readonly NumberWordScaleDraft[];
}

export function projectNumericLexicon(
	profile: ValueAuthoringProfileDto | null,
): NumericLexiconView {
	const numeric = (profile?.values?.numeric as Record<string, unknown>) ?? {};
	const numberWords = profile?.numberWords ?? {};
	return {
		decimalSeparator:
			typeof numeric.decimalSeparator === "string"
				? numeric.decimalSeparator
				: null,
		thousandsSeparator:
			typeof numeric.thousandsSeparator === "string"
				? numeric.thousandsSeparator
				: null,
		allowedForms: Array.isArray(numeric.allowedForms)
			? [...(numeric.allowedForms as NumericForm[])]
			: [],
		allowNegative:
			typeof numeric.allowNegative === "boolean" ? numeric.allowNegative : null,
		allowFractions:
			typeof numeric.allowFractions === "boolean"
				? numeric.allowFractions
				: null,
		allowMixedFractions:
			typeof numeric.allowMixedFractions === "boolean"
				? numeric.allowMixedFractions
				: null,
		allowScientific:
			typeof numeric.allowScientific === "boolean"
				? numeric.allowScientific
				: null,
		atoms: { ...((numberWords.atoms as Record<string, string>) ?? {}) },
		scales: Array.isArray(numberWords.scales)
			? [...(numberWords.scales as NumberWordScaleDraft[])]
			: [],
	};
}

export function editNumericOption(
	profile: ValueAuthoringProfileDto,
	key: NumericOptionKey,
	value: string | boolean | null,
): ValueAuthoringProfileDto {
	return setNumericOption(profile, key, value);
}

export function editNumericForm(
	profile: ValueAuthoringProfileDto,
	form: NumericForm,
	on: boolean,
): ValueAuthoringProfileDto {
	return toggleNumericForm(profile, form, on);
}

export function canonicalNumericForms(): readonly NumericForm[] {
	return NUMERIC_FORMS;
}

export function editNumberWordAtom(
	profile: ValueAuthoringProfileDto,
	word: string,
	digits: string | null,
): ValueAuthoringProfileDto {
	return setNumberWordAtom(profile, word, digits);
}

export function editNumberWordScales(
	profile: ValueAuthoringProfileDto,
	scales: readonly NumberWordScaleDraft[],
): ValueAuthoringProfileDto {
	return setNumberWordScales(profile, scales);
}
