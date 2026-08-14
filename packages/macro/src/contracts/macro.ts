import type { ExpressionBackend } from "./backends";
import type {
	MacroArgumentForm,
	MacroAuthoringTemplate,
	NamedGroupContract,
} from "./matching";
import type { MacroSyntax } from "./syntax";
import type { NumericBounds, ValueKind } from "./values";

export type MacroMatcher =
	| {
			kind: "pattern";
			pattern: string | RegExp;
			flags?: string;
			namedGroups?: NamedGroupContract;
	  }
	| { kind: "literal"; text: string; value?: unknown }
	| { kind: "expression"; backendId: string };

export interface MacroArgumentSpec {
	argumentId: string;
	name: string;
	aliases?: readonly string[];
	position?: number;
	path: string;
	matcher?: MacroMatcher | readonly MacroMatcher[];
	forms?: readonly MacroArgumentForm[];
	valueKind?: ValueKind;
	scalarType?: "string" | "integer" | "number" | "boolean";
	numericBounds?: NumericBounds;
	required?: boolean;
	repeatable?: boolean;
	itemDelimiter?: string;
	defaultValue?: string;
	blankPolicy?: "reject" | "allow" | "skip";
	normalize?: (
		raw: string,
		captures: Record<string, string | undefined>,
	) => unknown;
}

export interface MacroMatchingOptions {
	mode?: "unordered" | "declared";
	positionalFallback?: boolean;
	overlap?: "precedence" | "longest";
}

export interface MacroSpec {
	id: string;
	name: string;
	version?: number;
	arguments: readonly MacroArgumentSpec[];
	syntax?: Partial<MacroSyntax>;
	authoringTemplates?: readonly MacroAuthoringTemplate[];
	matching?: MacroMatchingOptions;
	metadata?: Record<string, unknown>;
	backendRequirements?: readonly string[];
}

export interface MacroRegistry {
	get(name: string): MacroSpec | undefined;
	list(): readonly MacroSpec[];
}

export interface MacroParseOptions {
	lineNumber?: number;
	mode?: "live" | "execute";
	profile?: Partial<MacroSyntax>;
	backends?: Readonly<Record<string, ExpressionBackend>>;
}
