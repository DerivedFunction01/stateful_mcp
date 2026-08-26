import type { MessageParam } from "@stateful-mcp/macro-protocol";
import { escapeRegex, getCompiledRegex } from "./regex";

export interface TemplateTokenSpec<T = unknown> {
	/** Regex pattern matching the token value (e.g. "\\d{4}", "[0-5]\\d", or "(?:0?[1-9]|1[0-2])") */
	readonly pattern: string;
	/** Optional field name for extracted output. Defaults to token identifier. */
	readonly field?: string;
	/** Optional transform applied to the raw captured string value */
	readonly transform?: (value: string) => T;
}

export interface CompileTemplateOptions {
	/** If true, parses embedded <regex:...> tags as raw regexes. If false (default), treats <regex:...> as plain literal text. */
	readonly allowRegexTokens?: boolean;
	/** Whether the compiled pattern must match the entire input string from start to end (default: true) */
	readonly exact?: boolean;
	/** Optional case-insensitive flag (default: true) */
	readonly caseInsensitive?: boolean;
	/** Optional Unicode flag (default: true) */
	readonly unicode?: boolean;
	/** Locale identifier for localized case folding */
	readonly locales?: string | readonly string[];
}

export interface TemplateDiagnostic {
	readonly code: string;
	readonly messageKey?: string;
	readonly messageParams?: Readonly<Record<string, MessageParam>>;
	readonly position?: number;
}

export interface CompiledTemplate<
	TFields extends Record<string, unknown> = Record<string, unknown>,
> {
	readonly template: string;
	readonly regex: RegExp;
	readonly tokenOrder: readonly string[];
	readonly groupToFieldMap: Readonly<Record<string, string>>;
	readonly fieldTransforms: Readonly<Record<string, (val: string) => unknown>>;
	readonly diagnostics: readonly TemplateDiagnostic[];
}

export interface TemplateParseResult<
	TFields extends Record<string, unknown> = Record<string, unknown>,
> {
	readonly matched: boolean;
	readonly fields: TFields;
	readonly rawMatches: Readonly<Record<string, string>>;
	readonly remainderText?: string;
	readonly diagnostics: readonly TemplateDiagnostic[];
}

export interface AuthoredTemplateTokenContext {
	readonly tokenId: string;
	readonly field: string;
	readonly rawText: string;
	readonly start: number;
	readonly end: number;
}

export type AuthoredTemplateTokenParser = (
	context: AuthoredTemplateTokenContext,
) => unknown | Promise<unknown>;

export interface AuthoredTemplateComponent {
	readonly tokenId: string;
	readonly field: string;
	readonly rawText: string;
	readonly value: unknown;
	readonly start: number;
	readonly end: number;
}

export interface AuthoredTemplateComponentResult {
	readonly matched: boolean;
	readonly components: readonly AuthoredTemplateComponent[];
	readonly diagnostics: readonly TemplateDiagnostic[];
}

const MAX_TEMPLATE_CACHE_SIZE = 500;
const templateCache = new Map<string, CompiledTemplate<any>>();

/**
 * Universal format template compiler.
 * Translates a user-defined template string into a high-performance compiled regular expression
 * with named capture groups, treating all non-token characters as literal separators and affixes.
 */
export function compileFormatTemplate<
	TFields extends Record<string, unknown> = Record<string, unknown>,
>(
	template: string,
	tokenSpecs: Readonly<Record<string, TemplateTokenSpec>>,
	options: CompileTemplateOptions = {},
): CompiledTemplate<TFields> {
	const allowRegexTokens = options.allowRegexTokens ?? false;
	const exact = options.exact ?? true;
	const caseInsensitive = options.caseInsensitive ?? true;
	const unicode = options.unicode ?? true;

	// Build cache key
	const tokenKeys = Object.keys(tokenSpecs).sort();
	const cacheKey = `${template}::${allowRegexTokens}::${exact}::${caseInsensitive}::${unicode}::${tokenKeys.join(",")}`;
	const cached = templateCache.get(cacheKey);
	if (cached) {
		return cached as CompiledTemplate<TFields>;
	}

	const diagnostics: TemplateDiagnostic[] = [];
	const tokenOrder: string[] = [];
	const groupToFieldMap: Record<string, string> = {};
	const fieldTransforms: Record<string, (val: string) => unknown> = {};

	// Sort token identifiers by length descending to guarantee greedy longest-match precedence
	const sortedTokenKeys = Object.keys(tokenSpecs).sort(
		(a, b) => b.length - a.length,
	);

	let assembledPattern = "";
	let literalBuffer = "";
	let tokenCounter = 0;

	const flushLiteralBuffer = () => {
		if (literalBuffer) {
			assembledPattern += escapeRegex(literalBuffer);
			literalBuffer = "";
		}
	};

	let i = 0;
	while (i < template.length) {
		// 1. Check for embedded <regex:...> tag when allowRegexTokens is enabled
		if (allowRegexTokens && template.startsWith("<regex:", i)) {
			const closeIndex = template.indexOf(">", i + 7);
			if (closeIndex !== -1) {
				const rawPattern = template.slice(i + 7, closeIndex);
				flushLiteralBuffer();
				try {
					// Validate raw regex syntax
					new RegExp(rawPattern, "u");
					assembledPattern += `(?:${rawPattern})`;
				} catch (err) {
					diagnostics.push({
						code: "invalid_template_regex",
						messageKey: "errors.templateInvalidRegex",
						messageParams: { position: i },
						position: i,
					});
					// Safely escape on syntax failure to prevent runtime crash
					assembledPattern += escapeRegex(template.slice(i, closeIndex + 1));
				}
				i = closeIndex + 1;
				continue;
			}
		}

		// 2. Check for recognized token matching at current position
		let matchedTokenKey: string | undefined;
		for (const tokenKey of sortedTokenKeys) {
			if (template.startsWith(tokenKey, i)) {
				matchedTokenKey = tokenKey;
				break;
			}
		}

		if (matchedTokenKey) {
			flushLiteralBuffer();
			const spec = tokenSpecs[matchedTokenKey]!;
			const fieldName = spec.field ?? matchedTokenKey;
			const safeGroupName = `t_${tokenCounter++}_${fieldName.replace(/[^a-zA-Z0-9_]/g, "_")}`;

			tokenOrder.push(fieldName);
			groupToFieldMap[safeGroupName] = fieldName;
			if (spec.transform) {
				fieldTransforms[fieldName] = spec.transform;
			}

			assembledPattern += `(?<${safeGroupName}>${spec.pattern})`;
			i += matchedTokenKey.length;
			continue;
		}

		// 3. Unrecognized character -> append to literal separator buffer
		literalBuffer += template[i];
		i++;
	}

	flushLiteralBuffer();

	const finalPattern = exact ? `^${assembledPattern}$` : assembledPattern;
	const flags = `${caseInsensitive ? "i" : ""}${unicode ? "u" : ""}`;

	let regex: RegExp;
	try {
		regex = getCompiledRegex(finalPattern, flags);
	} catch (err) {
		diagnostics.push({
			code: "invalid_compiled_template",
			messageKey: "errors.templateCompileFailed",
			messageParams: { pattern: finalPattern },
		});
		regex = getCompiledRegex("^$", flags);
	}

	const compiled: CompiledTemplate<TFields> = {
		template,
		regex,
		tokenOrder: Object.freeze(tokenOrder),
		groupToFieldMap: Object.freeze(groupToFieldMap),
		fieldTransforms: Object.freeze(fieldTransforms),
		diagnostics: Object.freeze(diagnostics),
	};

	if (templateCache.size >= MAX_TEMPLATE_CACHE_SIZE) {
		const firstKey = templateCache.keys().next().value;
		if (firstKey !== undefined) templateCache.delete(firstKey);
	}
	templateCache.set(cacheKey, compiled);
	return compiled;
}

/**
 * Parses an input string using a pre-compiled format template.
 * Extracts named fields and applies optional token value transforms.
 */
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
	) {
		return {
			matched: false,
			fields: {} as TFields,
			rawMatches: {},
			diagnostics: compiledTemplate.diagnostics,
		};
	}

	const match = compiledTemplate.regex.exec(input);
	if (!match || !match.groups) {
		return {
			matched: false,
			fields: {} as TFields,
			rawMatches: {},
			diagnostics: [],
		};
	}

	const fields: Record<string, unknown> = {};
	const rawMatches: Record<string, string> = {};

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
		} else {
			fields[fieldName] = rawValue;
		}
	}

	const matchEndIndex = match.index + match[0].length;
	const remainderText = input.slice(matchEndIndex).trim();

	return {
		matched: true,
		fields: fields as TFields,
		rawMatches: Object.freeze(rawMatches),
		remainderText: remainderText || undefined,
		diagnostics: compiledTemplate.diagnostics,
	};
}

/**
 * Helper to compile and parse a template in one call (reusing the underlying compiled template cache).
 */
export function parseWithTemplate<
	TFields extends Record<string, unknown> = Record<string, unknown>,
>(
	input: string,
	template: string,
	tokenSpecs: Readonly<Record<string, TemplateTokenSpec>>,
	options: CompileTemplateOptions = {},
): TemplateParseResult<TFields> {
	const compiled = compileFormatTemplate<TFields>(
		template,
		tokenSpecs,
		options,
	);
	return parseTemplateString(input, compiled);
}

/**
 * Compiles an already-tokenized authored format. The authored token order and
 * separators are preserved exactly; no permutations or domain templates are
 * generated.
 */
export function compileAuthoredTemplate<TToken extends string = string>(
	format: {
		readonly tokens: readonly TToken[];
		readonly separators: readonly string[];
	},
	tokenSpecs: Readonly<Record<TToken, TemplateTokenSpec>>,
	options: CompileTemplateOptions = {},
): CompiledTemplate {
	let template = "";
	for (let index = 0; index < format.tokens.length; index++) {
		template += format.separators[index] ?? "";
		template += format.tokens[index];
	}
	template += format.separators[format.tokens.length] ?? "";
	return compileFormatTemplate(template, tokenSpecs, options);
}

/** Parses authored template components synchronously. */
export function parseAuthoredTemplate(
	input: string,
	format: {
		readonly tokens: readonly string[];
		readonly separators: readonly string[];
	},
	compiled: CompiledTemplate,
	parsers: Readonly<Record<string, AuthoredTemplateTokenParser>>,
): AuthoredTemplateComponentResult {
	const parsed = parseTemplateString(input, compiled);
	if (!parsed.matched) {
		return { matched: false, components: [], diagnostics: parsed.diagnostics };
	}
	const components: AuthoredTemplateComponent[] = [];
	let searchOffset = 0;
	for (let index = 0; index < format.tokens.length; index++) {
		const tokenId = format.tokens[index]!;
		const field = compiled.tokenOrder[index]!;
		const rawText = parsed.rawMatches[field];
		if (rawText === undefined) continue;
		const start = input.indexOf(rawText, searchOffset);
		const safeStart = start < 0 ? searchOffset : start;
		const end = safeStart + rawText.length;
		const parser = parsers[tokenId];
		if (!parser)
			return {
				matched: false,
				components: [],
				diagnostics: [
					{
						code: "missing_token_parser",
						messageKey: "errors.templateMissingTokenParser",
					},
				],
			};
		const value = parser({ tokenId, field, rawText, start: safeStart, end });
		if (value instanceof Promise) {
			return {
				matched: false,
				components: [],
				diagnostics: [
					{
						code: "async_token_parser",
						messageKey: "errors.templateAsyncTokenParser",
					},
				],
			};
		}
		components.push({ tokenId, field, rawText, value, start: safeStart, end });
		searchOffset = end;
	}
	return { matched: true, components, diagnostics: parsed.diagnostics };
}

/** Parses authored template components with sync or async token parsers. */
export async function parseAuthoredTemplateAsync(
	input: string,
	format: {
		readonly tokens: readonly string[];
		readonly separators: readonly string[];
	},
	compiled: CompiledTemplate,
	parsers: Readonly<Record<string, AuthoredTemplateTokenParser>>,
): Promise<AuthoredTemplateComponentResult> {
	const parsed = parseTemplateString(input, compiled);
	if (!parsed.matched) {
		return { matched: false, components: [], diagnostics: parsed.diagnostics };
	}
	const components: AuthoredTemplateComponent[] = [];
	let searchOffset = 0;
	for (let index = 0; index < format.tokens.length; index++) {
		const tokenId = format.tokens[index]!;
		const field = compiled.tokenOrder[index]!;
		const rawText = parsed.rawMatches[field];
		if (rawText === undefined) continue;
		const start = input.indexOf(rawText, searchOffset);
		const safeStart = start < 0 ? searchOffset : start;
		const end = safeStart + rawText.length;
		const parser = parsers[tokenId];
		if (!parser)
			return {
				matched: false,
				components: [],
				diagnostics: [
					{
						code: "missing_token_parser",
						messageKey: "errors.templateMissingTokenParser",
					},
				],
			};
		let value: unknown;
		try {
			value = await parser({ tokenId, field, rawText, start: safeStart, end });
		} catch {
			return {
				matched: false,
				components: [],
				diagnostics: [
					{
						code: "token_parser_failed",
						messageKey: "errors.templateTokenParserFailed",
					},
				],
			};
		}
		if (value === undefined)
			return {
				matched: false,
				components: [],
				diagnostics: [
					{
						code: "token_unresolved",
						messageKey: "errors.templateTokenUnresolved",
					},
				],
			};
		components.push({ tokenId, field, rawText, value, start: safeStart, end });
		searchOffset = end;
	}
	return { matched: true, components, diagnostics: parsed.diagnostics };
}
