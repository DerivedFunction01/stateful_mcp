import { escapeRegex, getCompiledRegex } from "../regex";
import type {
	CompiledTemplate,
	CompileTemplateOptions,
	TemplateDiagnostic,
	TemplateTokenSpec,
} from "./types";

const MAX_TEMPLATE_CACHE_SIZE = 500;
const templateCache = new Map<string, CompiledTemplate<any>>();

export function compileFormatTemplate<
	TFields extends Record<string, unknown> = Record<string, unknown>,
>(
	template: string,
	tokenSpecs: Readonly<Record<string, TemplateTokenSpec>>,
	options: CompileTemplateOptions = {},
): CompiledTemplate<TFields> {
	const allowRegexTokens = options.allowRegexTokens ?? false,
		exact = options.exact ?? true,
		caseInsensitive = options.caseInsensitive ?? true,
		unicode = options.unicode ?? true;
	const tokenKeys = Object.keys(tokenSpecs).sort();
	const cacheKey = `${template}::${allowRegexTokens}::${exact}::${caseInsensitive}::${unicode}::${tokenKeys.join(",")}`;
	const cached = templateCache.get(cacheKey);
	if (cached) return cached as CompiledTemplate<TFields>;
	const diagnostics: TemplateDiagnostic[] = [],
		tokenOrder: string[] = [],
		groupToFieldMap: Record<string, string> = {},
		fieldTransforms: Record<string, (val: string) => unknown> = {};
	const sortedTokenKeys = Object.keys(tokenSpecs).sort(
		(a, b) => b.length - a.length,
	);
	let assembledPattern = "",
		literalBuffer = "",
		tokenCounter = 0;
	const flushLiteralBuffer = () => {
		if (literalBuffer) {
			assembledPattern += escapeRegex(literalBuffer);
			literalBuffer = "";
		}
	};
	let i = 0;
	while (i < template.length) {
		if (allowRegexTokens && template.startsWith("<regex:", i)) {
			const closeIndex = template.indexOf(">", i + 7);
			if (closeIndex !== -1) {
				const rawPattern = template.slice(i + 7, closeIndex);
				flushLiteralBuffer();
				try {
					new RegExp(rawPattern, "u");
					assembledPattern += `(?:${rawPattern})`;
				} catch {
					diagnostics.push({
						code: "invalid_template_regex",
						messageKey: "errors.templateInvalidRegex",
						messageParams: { position: i },
						position: i,
					});
					assembledPattern += escapeRegex(template.slice(i, closeIndex + 1));
				}
				i = closeIndex + 1;
				continue;
			}
		}
		let matchedTokenKey: string | undefined;
		for (const tokenKey of sortedTokenKeys)
			if (template.startsWith(tokenKey, i)) {
				matchedTokenKey = tokenKey;
				break;
			}
		if (matchedTokenKey) {
			flushLiteralBuffer();
			const spec = tokenSpecs[matchedTokenKey]!;
			const fieldName = spec.field ?? matchedTokenKey;
			const safeGroupName = `t_${tokenCounter++}_${fieldName.replace(/[^a-zA-Z0-9_]/g, "_")}`;
			tokenOrder.push(fieldName);
			groupToFieldMap[safeGroupName] = fieldName;
			if (spec.transform) fieldTransforms[fieldName] = spec.transform;
			assembledPattern += `(?<${safeGroupName}>${spec.pattern})`;
			i += matchedTokenKey.length;
			continue;
		}
		literalBuffer += template[i];
		i++;
	}
	flushLiteralBuffer();
	const finalPattern = exact ? `^${assembledPattern}$` : assembledPattern,
		flags = `${caseInsensitive ? "i" : ""}${unicode ? "u" : ""}`;
	let regex: RegExp;
	try {
		regex = getCompiledRegex(finalPattern, flags);
	} catch {
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
