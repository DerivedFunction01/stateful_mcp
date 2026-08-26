import { compileFormatTemplate } from "./compiler";
import { parseTemplateString } from "./parser";
import type {
	AuthoredTemplateComponent,
	AuthoredTemplateComponentResult,
	AuthoredTemplateTokenParser,
	CompiledTemplate,
	CompileTemplateOptions,
	TemplateTokenSpec,
} from "./types";

type AuthoredFormat = {
	readonly tokens: readonly string[];
	readonly separators: readonly string[];
};

export function compileAuthoredTemplate<TToken extends string = string>(
	format: AuthoredFormat,
	tokenSpecs: Readonly<Record<TToken, TemplateTokenSpec>>,
	options: CompileTemplateOptions = {},
): CompiledTemplate {
	let template = "";
	for (let index = 0; index < format.tokens.length; index++)
		template += (format.separators[index] ?? "") + format.tokens[index];
	template += format.separators[format.tokens.length] ?? "";
	return compileFormatTemplate(template, tokenSpecs, options);
}

function missingParserResult(
	code: string,
	messageKey: string,
): AuthoredTemplateComponentResult {
	return {
		matched: false,
		components: [],
		diagnostics: [{ code, messageKey }],
	};
}

export function parseAuthoredTemplate(
	input: string,
	format: AuthoredFormat,
	compiled: CompiledTemplate,
	parsers: Readonly<Record<string, AuthoredTemplateTokenParser>>,
): AuthoredTemplateComponentResult {
	const parsed = parseTemplateString(input, compiled);
	if (!parsed.matched)
		return { matched: false, components: [], diagnostics: parsed.diagnostics };
	const components: AuthoredTemplateComponent[] = [];
	let searchOffset = 0;
	for (let index = 0; index < format.tokens.length; index++) {
		const tokenId = format.tokens[index]!,
			field = compiled.tokenOrder[index]!,
			rawText = parsed.rawMatches[field];
		if (rawText === undefined) continue;
		const start = input.indexOf(rawText, searchOffset),
			safeStart = start < 0 ? searchOffset : start,
			end = safeStart + rawText.length,
			parser = parsers[tokenId];
		if (!parser)
			return missingParserResult(
				"missing_token_parser",
				"errors.templateMissingTokenParser",
			);
		const value = parser({ tokenId, field, rawText, start: safeStart, end });
		if (value instanceof Promise)
			return missingParserResult(
				"async_token_parser",
				"errors.templateAsyncTokenParser",
			);
		components.push({ tokenId, field, rawText, value, start: safeStart, end });
		searchOffset = end;
	}
	return { matched: true, components, diagnostics: parsed.diagnostics };
}

export async function parseAuthoredTemplateAsync(
	input: string,
	format: AuthoredFormat,
	compiled: CompiledTemplate,
	parsers: Readonly<Record<string, AuthoredTemplateTokenParser>>,
): Promise<AuthoredTemplateComponentResult> {
	const parsed = parseTemplateString(input, compiled);
	if (!parsed.matched)
		return { matched: false, components: [], diagnostics: parsed.diagnostics };
	const components: AuthoredTemplateComponent[] = [];
	let searchOffset = 0;
	for (let index = 0; index < format.tokens.length; index++) {
		const tokenId = format.tokens[index]!,
			field = compiled.tokenOrder[index]!,
			rawText = parsed.rawMatches[field];
		if (rawText === undefined) continue;
		const start = input.indexOf(rawText, searchOffset),
			safeStart = start < 0 ? searchOffset : start,
			end = safeStart + rawText.length,
			parser = parsers[tokenId];
		if (!parser)
			return missingParserResult(
				"missing_token_parser",
				"errors.templateMissingTokenParser",
			);
		let value: unknown;
		try {
			value = await parser({ tokenId, field, rawText, start: safeStart, end });
		} catch {
			return missingParserResult(
				"token_parser_failed",
				"errors.templateTokenParserFailed",
			);
		}
		if (value === undefined)
			return missingParserResult(
				"token_unresolved",
				"errors.templateTokenUnresolved",
			);
		components.push({ tokenId, field, rawText, value, start: safeStart, end });
		searchOffset = end;
	}
	return { matched: true, components, diagnostics: parsed.diagnostics };
}
