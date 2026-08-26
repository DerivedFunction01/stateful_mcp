import type { AliasNamespace, AliasNamespaceMeta } from "./contracts";

export const ALIAS_NAMESPACES: Readonly<
	Record<AliasNamespace, AliasNamespaceMeta>
> = Object.freeze({
	"canonical-id": {
		id: "canonical-id",
		description:
			"Explicit canonical identifier spellings; the canonical id is never auto-accepted.",
		targetKind: "canonical",
	},
	literal: {
		id: "literal",
		description: "Literal string value spelled out explicitly.",
		targetKind: "literal",
	},
	resolver: {
		id: "resolver",
		description:
			"Registered resolver invoked with declarative params and injected runtime context.",
		targetKind: "resolver",
	},
	fundamental: {
		id: "fundamental",
		description: "Fundamental/extraction group reference.",
		targetKind: "fundamental",
	},
	extraction: {
		id: "extraction",
		description: "Standalone extraction reference.",
		targetKind: "extraction",
	},
	"number-word": {
		id: "number-word",
		description: "Number expressed as a word mapping to a numeric value.",
		targetKind: "number-word",
	},
});
