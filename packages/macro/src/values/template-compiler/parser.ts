import { compileFormatTemplate } from "./compiler";
import type {
	CompiledTemplate,
	CompileTemplateOptions,
	TemplateParseResult,
	TemplateTokenSpec,
} from "./types";

export function parseTemplateString<
	TFields extends Record<string, unknown> = Record<string, unknown>,
>(
	input: string,
	compiledTemplate: CompiledTemplate<TFields>,
): TemplateParseResult<TFields> {
	if (
		compiledTemplate.diagnostics.some(
			(d) => d.code === "invalid_compiled_template",
		)
	)
		return {
			matched: false,
			fields: {} as TFields,
			rawMatches: {},
			diagnostics: compiledTemplate.diagnostics,
		};
	const match = compiledTemplate.regex.exec(input);
	if (!match || !match.groups)
		return {
			matched: false,
			fields: {} as TFields,
			rawMatches: {},
			diagnostics: [],
		};
	const fields: Record<string, unknown> = {},
		rawMatches: Record<string, string> = {};
	for (const [groupName, rawValue] of Object.entries(match.groups)) {
		if (rawValue === undefined) continue;
		const fieldName = compiledTemplate.groupToFieldMap[groupName];
		if (!fieldName) continue;
		rawMatches[fieldName] = rawValue;
		const transform = compiledTemplate.fieldTransforms[fieldName];
		if (transform) {
			try {
				fields[fieldName] = transform(rawValue);
			} catch {
				fields[fieldName] = rawValue;
			}
		} else fields[fieldName] = rawValue;
	}
	const remainderText = input.slice(match.index + match[0].length).trim();
	return {
		matched: true,
		fields: fields as TFields,
		rawMatches: Object.freeze(rawMatches),
		remainderText: remainderText || undefined,
		diagnostics: compiledTemplate.diagnostics,
	};
}

export function parseWithTemplate<
	TFields extends Record<string, unknown> = Record<string, unknown>,
>(
	input: string,
	template: string,
	tokenSpecs: Readonly<Record<string, TemplateTokenSpec>>,
	options: CompileTemplateOptions = {},
): TemplateParseResult<TFields> {
	return parseTemplateString(
		input,
		compileFormatTemplate<TFields>(template, tokenSpecs, options),
	);
}
