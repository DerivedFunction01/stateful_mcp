import type { ErrorDescriptor } from "@stateful-mcp/macro-protocol";

export type FundamentalPosition = "prefix" | "connector" | "postfix";

export interface RangeComponent {
	readonly id: string;
	readonly prefix?: readonly FundamentalPattern[];
	readonly connector: readonly FundamentalPattern[];
	readonly suffix?: readonly FundamentalPattern[];
}

export interface FundamentalPattern {
	readonly id: string;
	readonly text: string;
	readonly isRegex?: boolean;
	readonly caseSensitive?: boolean;
	readonly boundary?: "none" | "unicode";
}

export interface FundamentalSlot {
	readonly id: string;
	readonly parserId?: string;
	/** Optional terminal-specific capture pattern; defaults to one token. */
	readonly pattern?: string;
}

export interface FundamentalVariant {
	readonly id: string;
	readonly slots: readonly FundamentalSlot[];
	readonly prefix?: readonly FundamentalPattern[];
	readonly connectors?: readonly (readonly FundamentalPattern[])[];
	readonly postfix?: readonly FundamentalPattern[];
	readonly priority?: number;
}

export interface FundamentalGroup {
	readonly id: string;
	readonly variants: readonly FundamentalVariant[];
}

export interface FundamentalDiagnostic extends ErrorDescriptor {
	readonly errorCode?: string;
	readonly path?: readonly string[];
	readonly groupId?: string;
	readonly variantId?: string;
	readonly position?: FundamentalPosition;
}

export interface CompiledFundamentalVariant {
	readonly groupId: string;
	readonly variantId: string;
	readonly slots: readonly FundamentalSlot[];
	readonly regex: RegExp;
	readonly priority?: number;
	readonly patternIds: readonly string[];
}

export interface FundamentalCompileResult {
	readonly variants: readonly CompiledFundamentalVariant[];
	readonly diagnostics: readonly FundamentalDiagnostic[];
}

export interface FundamentalExtraction {
	readonly groupId: string;
	readonly variantId: string;
	readonly slots: Readonly<Record<string, string>>;
	readonly slotSpans: Readonly<Record<string, { start: number; end: number }>>;
	readonly matchedPatterns: readonly string[];
	readonly priority?: number;
}
