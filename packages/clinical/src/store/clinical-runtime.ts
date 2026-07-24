import type { EntityStore } from "@stateful-mcp/core";
import type {
	ClinicalStoreConfig,
} from "./clinical-config";
import {
	ClinicalParserConceptDefaultStore,
	ClinicalParserProfileStore,
} from "./clinical-store";
import type {
	ParserConceptDefault,
	ParserConceptDefaultStore,
	ParserProfileStore,
	ParserSyntaxProfile,
} from "./interfaces";

export interface ClinicalRuntimeParserStores {
	profiles: ParserProfileStore;
	conceptDefaults: ParserConceptDefaultStore;
}

export function buildClinicalParserStores(
	config: ClinicalStoreConfig,
	profileEntityStore: EntityStore<ParserSyntaxProfile>,
	conceptDefaultEntityStore: EntityStore<ParserConceptDefault>,
): ClinicalRuntimeParserStores {
	return {
		profiles: new ClinicalParserProfileStore(
			profileEntityStore,
			config.seeds.parserProfiles,
		),
		conceptDefaults: new ClinicalParserConceptDefaultStore(
			conceptDefaultEntityStore,
			config.seeds.conceptDefaults,
		),
	};
}

