import type { ConceptResolution, ConceptResolver } from "../values/quantity";

/** Identity of the resource which supplied a configured concept resolution. */
export interface ResolverProvenance {
	readonly ownerExtensionId: string;
	readonly resourceId: string;
	readonly resolverId: string;
	readonly version: string | number;
}

export type ConfiguredConceptResolution = ConceptResolution & {
	readonly provenance: ResolverProvenance;
};

/** Resolver contract used by configured value recipes. */
export interface ConfiguredConceptResolver extends ConceptResolver {
	readonly provenance: ResolverProvenance;
}
