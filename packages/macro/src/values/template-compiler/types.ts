import type { MessageParam } from "@stateful-mcp/macro-protocol";

export interface TemplateTokenSpec<T = unknown> {
	readonly pattern: string;
	readonly field?: string;
	readonly transform?: (value: string) => T;
}
export interface CompileTemplateOptions {
	readonly allowRegexTokens?: boolean;
	readonly exact?: boolean;
	readonly caseInsensitive?: boolean;
	readonly unicode?: boolean;
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
