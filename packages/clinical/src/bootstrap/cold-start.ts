import type { DictionaryConfig, DictionaryStore } from "@stateful-mcp/core";
import {
	type CommandSyntaxProfile,
	createCommandSyntaxProfile,
} from "../commands/command-syntax-profile";
import {
	_PRIMARY_DIAGNOSIS_MACRO,
	seedDefaultMacros,
} from "../macros/default-macros";
import type { MacroDefinition, MacroStore } from "../macros/macro-definition";
import { createDefaultSchemaRegistry } from "../schemas/default-registry";
import {
	createTemporalSyntaxProfile,
	type TemporalSyntaxProfile,
} from "../values/temporal-syntax-profile";
import {
	type ValueRule,
	ValueRuleRegistry,
} from "../values/value-rule-registry";
import {
	bootstrapCommandDefaults,
	bootstrapTemporalDefaults,
} from "./bootstrap-config";

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
export async function initializeColdStart(
	options: ColdStartOptions,
): Promise<ColdStartState> {
	const commandProfile =
		options.commandProfile ??
		createCommandSyntaxProfile(
			{
				profileId: "v2-default",
				active: true,
				default: true,
			},
			bootstrapCommandDefaults,
		);
	const temporalProfile =
		options.temporalProfile ??
		createTemporalSyntaxProfile(
			{
				profileId: `${commandProfile.profileId}:temporal`,
			},
			bootstrapTemporalDefaults,
		);
	await options.dictionary.loadConfig({
		allowedTargetAssignments: [
			"PrimaryDiagnosis.id",
			"PrimaryDiagnosis.diagnosis",
			"Observation.concept",
			"Medication.medication",
		],
		allowedTags: ["clinical", "workspace", "v2"],
		defaultWorkspaceId: "global",
		concepts: [
			{
				id: "c-pneumonia",
				namespaceCode: "SNOMED",
				standardCode: "233604007",
				display: "Pneumonia",
				active: true,
			},
		],
		expressions: [],
		...options.dictionaryConfig,
	});
	await seedDefaultMacros(options.macroStore);
	const valueRules = new ValueRuleRegistry();
	if (options.valueRules?.length)
		valueRules.register(commandProfile.profileId, options.valueRules);
	return {
		schemaRegistry: createDefaultSchemaRegistry(),
		commandProfile,
		temporalProfile,
		valueRules,
		macroStore: options.macroStore,
		dictionary: options.dictionary,
	};
}
export { _PRIMARY_DIAGNOSIS_MACRO };
