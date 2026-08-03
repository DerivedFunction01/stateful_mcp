import type { DictionaryConfig, DictionaryStore } from "@stateful-mcp/core";
import { createDefaultV2SchemaRegistry } from "../schemas/default-registry";
import { createV2CommandSyntaxProfile, type V2CommandSyntaxProfile } from "../commands/command-syntax-profile";
import { createV2TemporalSyntaxProfile, type V2TemporalSyntaxProfile } from "../values/temporal-syntax-profile";
import { ValueRuleRegistry, type V2ValueRule } from "../values/value-rule-registry";
import { seedDefaultV2Macros, V2_PRIMARY_DIAGNOSIS_MACRO } from "../macros/default-macros";
import type { MacroStore, V2MacroDefinition } from "../macros/macro-definition";

export interface V2ColdStartOptions {
	dictionary: DictionaryStore;
	macroStore: MacroStore & { set(macro: V2MacroDefinition): Promise<void> };
	commandProfile?: V2CommandSyntaxProfile;
	temporalProfile?: V2TemporalSyntaxProfile;
	valueRules?: readonly V2ValueRule[];
	dictionaryConfig?: DictionaryConfig;
}
export interface V2ColdStartState {
	schemaRegistry: ReturnType<typeof createDefaultV2SchemaRegistry>;
	commandProfile: V2CommandSyntaxProfile;
	temporalProfile: V2TemporalSyntaxProfile;
	valueRules: ValueRuleRegistry;
	macroStore: V2ColdStartOptions["macroStore"];
	dictionary: DictionaryStore;
}

/** Seeds only V2 runtime dependencies; no legacy parser/profile stores are touched. */
export async function initializeV2ColdStart(options: V2ColdStartOptions): Promise<V2ColdStartState> {
	const commandProfile = options.commandProfile ?? createV2CommandSyntaxProfile({ profileId: "v2-default", active: true, default: true });
	const temporalProfile = options.temporalProfile ?? createV2TemporalSyntaxProfile({ profileId: `${commandProfile.profileId}:temporal` });
	await options.dictionary.loadConfig({ allowedTargetAssignments: ["PrimaryDiagnosis.id", "PrimaryDiagnosis.diagnosis", "Observation.concept", "Medication.medication"], allowedTags: ["clinical", "workspace", "v2"], defaultWorkspaceId: "global", concepts: [{ id: "c-pneumonia", namespaceCode: "SNOMED", standardCode: "233604007", display: "Pneumonia", active: true }], expressions: [], ...options.dictionaryConfig });
	await seedDefaultV2Macros(options.macroStore);
	const valueRules = new ValueRuleRegistry();
	if (options.valueRules?.length) valueRules.register(commandProfile.profileId, options.valueRules);
	return { schemaRegistry: createDefaultV2SchemaRegistry(), commandProfile, temporalProfile, valueRules, macroStore: options.macroStore, dictionary: options.dictionary };
}
export { V2_PRIMARY_DIAGNOSIS_MACRO };
