import type { DictionaryConfig, DictionaryStore } from "@stateful-mcp/core";
import { createDefaultSchemaRegistry } from "../schemas/default-registry";
import { createCommandSyntaxProfile, type CommandSyntaxProfile } from "../commands/command-syntax-profile";
import { createTemporalSyntaxProfile, type TemporalSyntaxProfile } from "../values/temporal-syntax-profile";
import { ValueRuleRegistry, type ValueRule } from "../values/value-rule-registry";
import { seedDefaultMacros, _PRIMARY_DIAGNOSIS_MACRO } from "../macros/default-macros";
import type { MacroStore, MacroDefinition } from "../macros/macro-definition";

export interface ColdStartOptions {
	dictionary: DictionaryStore;
	macroStore: MacroStore & { set(macro: MacroDefinition): Promise<void> };
	commandProfile?: CommandSyntaxProfile;
	temporalProfile?: TemporalSyntaxProfile;
	valueRules?: readonly ValueRule[];
	dictionaryConfig?: DictionaryConfig;
}
export interface ColdStartState {
	schemaRegistry: ReturnType<typeof createDefaultSchemaRegistry>;
	commandProfile: CommandSyntaxProfile;
	temporalProfile: TemporalSyntaxProfile;
	valueRules: ValueRuleRegistry;
	macroStore: ColdStartOptions["macroStore"];
	dictionary: DictionaryStore;
}

/** Seeds only  runtime dependencies; no legacy parser/profile stores are touched. */
export async function initializeColdStart(options: ColdStartOptions): Promise<ColdStartState> {
	const commandProfile = options.commandProfile ?? createCommandSyntaxProfile({ profileId: "v2-default", active: true, default: true });
	const temporalProfile = options.temporalProfile ?? createTemporalSyntaxProfile({ profileId: `${commandProfile.profileId}:temporal` });
	await options.dictionary.loadConfig({ allowedTargetAssignments: ["PrimaryDiagnosis.id", "PrimaryDiagnosis.diagnosis", "Observation.concept", "Medication.medication"], allowedTags: ["clinical", "workspace", "v2"], defaultWorkspaceId: "global", concepts: [{ id: "c-pneumonia", namespaceCode: "SNOMED", standardCode: "233604007", display: "Pneumonia", active: true }], expressions: [], ...options.dictionaryConfig });
	await seedDefaultMacros(options.macroStore);
	const valueRules = new ValueRuleRegistry();
	if (options.valueRules?.length) valueRules.register(commandProfile.profileId, options.valueRules);
	return { schemaRegistry: createDefaultSchemaRegistry(), commandProfile, temporalProfile, valueRules, macroStore: options.macroStore, dictionary: options.dictionary };
}
export { _PRIMARY_DIAGNOSIS_MACRO };
