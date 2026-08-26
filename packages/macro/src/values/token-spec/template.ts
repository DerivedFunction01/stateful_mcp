import { escapeRegex, getCompiledRegex } from "../regex";
import type { ValueFormatConfig } from "./catalog";

export interface TemplateTokenSegment {
	readonly kind: "token" | "literal" | "unknown-token";
	readonly text: string;
	readonly start: number;
	readonly end: number;
	readonly tokenId?: string;
}

export interface TemplateAnalysis<TToken extends string = string> {
	readonly template: string;
	readonly tokens: readonly TToken[];
	readonly segments: readonly TemplateTokenSegment[];
	readonly unknownTokens: readonly TemplateTokenSegment[];
	readonly config: ValueFormatConfig<TToken>;
}

/**
 * Parses a format template string into structured tokens and separators.
 * Longest tokens in the catalog are prioritized.
 */
export function parseFormatTemplate<TToken extends string = string>(
	templateStr: string,
	tokenCatalog: readonly TToken[],
	id?: string,
): ValueFormatConfig<TToken> {
	const sortedCatalog = [...tokenCatalog].sort((a, b) => b.length - a.length);
	const tokens: TToken[] = [];
	const separators: string[] = [];

	let remaining = templateStr;
	let currentSep = "";

	while (remaining.length > 0) {
		let matchedToken: TToken | undefined;
		for (const token of sortedCatalog) {
			if (remaining.startsWith(token)) {
				matchedToken = token;
				break;
			}
		}

		if (matchedToken) {
			separators.push(currentSep);
			tokens.push(matchedToken);
			currentSep = "";
			remaining = remaining.slice(matchedToken.length);
		} else {
			currentSep += remaining[0];
			remaining = remaining.slice(1);
		}
	}
	separators.push(currentSep);

	return {
		...(id ? { id } : {}),
		tokens: Object.freeze(tokens),
		separators: Object.freeze(separators),
	};
}

/**
 * Provides source-preserving template analysis without changing the legacy
 * parser/compiler behavior. Unknown tokens are only identified through the
 * explicit <TOKEN> or {TOKEN} placeholder syntax.
 */
export function analyzeFormatTemplate<TToken extends string = string>(
	template: string,
	tokenCatalog: readonly TToken[],
	id?: string,
): TemplateAnalysis<TToken> {
	const segments: TemplateTokenSegment[] = [];
	const tokens: TToken[] = [];
	const tokenSet = new Set(tokenCatalog);
	const sortedCatalog = [...tokenCatalog].sort(
		(left, right) => right.length - left.length,
	);
	const pushLiteral = (text: string, start: number, end: number) => {
		if (text) segments.push({ kind: "literal", text, start, end });
	};
	let index = 0;
	let literalStart = 0;
	while (index < template.length) {
		const token = sortedCatalog.find((candidate) =>
			template.startsWith(candidate, index),
		);
		if (token) {
			pushLiteral(template.slice(literalStart, index), literalStart, index);
			const end = index + token.length;
			segments.push({
				kind: "token",
				text: token,
				start: index,
				end,
				tokenId: token,
			});
			tokens.push(token);
			index = end;
			literalStart = index;
			continue;
		}
		const explicit =
			template[index] === "<" ? ">" : template[index] === "{" ? "}" : undefined;
		if (explicit) {
			const close = template.indexOf(explicit, index + 1);
			if (close > index + 1) {
				const candidate = template.slice(index + 1, close);
				if (/^[A-Z][A-Z0-9_]*$/u.test(candidate)) {
					pushLiteral(template.slice(literalStart, index), literalStart, index);
					const kind = tokenSet.has(candidate as TToken)
						? "token"
						: "unknown-token";
					segments.push({
						kind,
						text: candidate,
						start: index,
						end: close + 1,
						tokenId: candidate,
					});
					if (kind === "token") tokens.push(candidate as TToken);
					index = close + 1;
					literalStart = index;
					continue;
				}
			}
		}
		index++;
	}
	pushLiteral(template.slice(literalStart), literalStart, template.length);
	return {
		template,
		tokens: Object.freeze(tokens),
		segments: Object.freeze(segments),
		unknownTokens: Object.freeze(
			segments.filter((segment) => segment.kind === "unknown-token"),
		),
		config: parseFormatTemplate(template, tokenCatalog, id),
	};
}

/**
 * Converts a structured ValueFormatConfig or tokens/separators pair back into a template string.
 */
export function formatTemplateToString<TToken extends string = string>(
	config:
		| ValueFormatConfig<TToken>
		| {
				readonly tokens: readonly TToken[];
				readonly separators: readonly string[];
		  },
): string {
	const { tokens, separators } = config;
	let result = separators[0] ?? "";
	for (let i = 0; i < tokens.length; i++) {
		result += tokens[i]! + (separators[i + 1] ?? "");
	}
	return result;
}

export interface CompileFormatRegexOptions {
	readonly exact?: boolean;
	readonly caseInsensitive?: boolean;
	readonly unicode?: boolean;
	readonly flexibleWhitespace?: boolean;
}

/**
 * Compiles a ValueFormatConfig or template string into a RegExp with named capture groups.
 */
export function compileFormatRegex<TToken extends string = string>(
	formatConfig: ValueFormatConfig<TToken> | string,
	tokenPatternMap: Readonly<Record<string, string>>,
	options: CompileFormatRegexOptions = {},
	tokenCatalog?: readonly TToken[],
): RegExp {
	const config: ValueFormatConfig<TToken> =
		typeof formatConfig === "string"
			? parseFormatTemplate(
					formatConfig,
					tokenCatalog ??
						(Object.keys(tokenPatternMap) as unknown as readonly TToken[]),
				)
			: formatConfig;

	const exact = options.exact ?? true;
	const caseInsensitive = options.caseInsensitive ?? true;
	const unicode = options.unicode ?? true;
	const flexibleWhitespace = options.flexibleWhitespace ?? true;

	let pattern = "";
	const { tokens, separators } = config;

	const formatSeparator = (sep: string): string => {
		if (!sep) return "";
		if (flexibleWhitespace && /\s+/.test(sep)) {
			// Replace whitespace runs in separator with \s+ or \s*
			return sep
				.split(/(\s+)/)
				.map((part) => (/\s+/.test(part) ? "\\s+" : escapeRegex(part)))
				.join("");
		}
		return escapeRegex(sep);
	};

	pattern += formatSeparator(separators[0] ?? "");

	for (let i = 0; i < tokens.length; i++) {
		const token = tokens[i]!;
		const tokenPattern = tokenPatternMap[token] ?? `(?<${token}>.+)`;
		pattern += tokenPattern;
		pattern += formatSeparator(separators[i + 1] ?? "");
	}

	const finalPattern = exact ? `^${pattern}$` : pattern;
	const flags = `${caseInsensitive ? "i" : ""}${unicode ? "u" : ""}`;
	return getCompiledRegex(finalPattern, flags);
}
