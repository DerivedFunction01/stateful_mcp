export const OPERATOR_KINDS = [
	"equal",
	"not_equal",
	"greater_equal",
	"less_equal",
	"greater",
	"less",
	"approximate",
	"tolerance",
] as const;

export type OperatorKind = (typeof OPERATOR_KINDS)[number];

export type OperatorPosition = "prefix" | "postfix";

export const OPERATOR_INVERSIONS: Readonly<Record<OperatorKind, OperatorKind>> =
	{
		greater: "less_equal",
		greater_equal: "less",
		less: "greater_equal",
		less_equal: "greater",
		equal: "not_equal",
		not_equal: "equal",
		approximate: "not_equal",
		tolerance: "tolerance",
	};

export interface OperatorConfig {
	readonly operators?: Readonly<
		Partial<Record<OperatorKind, readonly string[]>>
	>;
	readonly prefixAliases?: Readonly<
		Partial<Record<OperatorKind, readonly string[]>>
	>;
	readonly postfixAliases?: Readonly<
		Partial<Record<OperatorKind, readonly string[]>>
	>;
	readonly negationPrefixes?: readonly string[];
	readonly negationPostfixes?: readonly string[];
	readonly locales?: string | readonly string[];
	readonly caseSensitive?: boolean;
}

export interface OperatorMatch {
	readonly operator: OperatorKind;
	readonly position: OperatorPosition;
	readonly rawText: string;
	readonly matchedAlias: string;
	readonly isInverted?: boolean;
}

export interface ExtractedOperatorResult {
	readonly operatorMatch?: OperatorMatch;
	readonly remainderText: string;
}
