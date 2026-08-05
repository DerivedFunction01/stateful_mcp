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
	createNumericalSyntaxProfile,
	type NumericalSyntaxProfile,
} from "../values/numerical-syntax-profile";
import {
	type ValueRule,
	ValueRuleRegistry,
} from "../values/value-rule-registry";
import {
	bootstrapCommandDefaults,
	bootstrapNumericalDefaults,
} from "./bootstrap-config";

export interface ColdStartOptions {
	dictionary: DictionaryStore;
	macroStore: MacroStore & { set(macro: MacroDefinition): Promise<void> };
	commandProfile?: CommandSyntaxProfile;
	numericalProfile?: NumericalSyntaxProfile;
	valueRules?: readonly ValueRule[];
	dictionaryConfig?: DictionaryConfig;
}
export interface ColdStartState {
	schemaRegistry: ReturnType<typeof createDefaultSchemaRegistry>;
	commandProfile: CommandSyntaxProfile;
	numericalProfile: NumericalSyntaxProfile;
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
	const numericalProfile =
		options.numericalProfile ??
		createNumericalSyntaxProfile(
			{
				profileId: `${commandProfile.profileId}:numerical`,
			},
			bootstrapNumericalDefaults,
		);
	await options.dictionary.loadConfig({
		allowedTargetAssignments: [
			"PrimaryDiagnosis.id",
			"PrimaryDiagnosis.diagnosis",
			"primary_diagnosis.diagnosis",
			"assessment.concept",
			"note.title",
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
			{
				id: "c-sob",
				namespaceCode: "SNOMED",
				standardCode: "267036007",
				display: "Shortness of breath",
				active: true,
			},
			{
				id: "c-fever",
				namespaceCode: "SNOMED",
				standardCode: "386661006",
				display: "Fever",
				active: true,
			},
			{
				id: "c-chest-pain",
				namespaceCode: "SNOMED",
				standardCode: "29857009",
				display: "Chest pain",
				active: true,
			},
			{
				id: "c-cough",
				namespaceCode: "SNOMED",
				standardCode: "49727002",
				display: "Cough",
				active: true,
			},
			{
				id: "c-headache",
				namespaceCode: "SNOMED",
				standardCode: "25064002",
				display: "Headache",
				active: true,
			},
			{
				id: "c-dyspnea-icd",
				namespaceCode: "ICD-10",
				standardCode: "R06.00",
				display: "Dyspnea, unspecified",
				active: true,
			},
			{
				id: "c-fever-icd",
				namespaceCode: "ICD-10",
				standardCode: "R50.9",
				display: "Fever, unspecified",
				active: true,
			},
			{
				id: "c-heart-rate",
				namespaceCode: "LOINC",
				standardCode: "8867-4",
				display: "Heart rate",
				active: true,
			},
			{
				id: "c-respiratory-rate",
				namespaceCode: "LOINC",
				standardCode: "9279-1",
				display: "Respiratory rate",
				active: true,
			},
			{
				id: "c-harry-potter",
				namespaceCode: "BOOK",
				standardCode: "HP",
				display: "Harry Potter",
				active: true,
			},
			{
				id: "c-deathly-hallows",
				namespaceCode: "BOOK",
				standardCode: "HP-DH",
				display: "Harry Potter and the Deathly Hallows",
				active: true,
			},
			{
				id: "c-lord-of-the-rings",
				namespaceCode: "BOOK",
				standardCode: "LOTR",
				display: "Lord of the Rings",
				active: true,
			},
			{
				id: "c-hunger-games",
				namespaceCode: "BOOK",
				standardCode: "HG",
				display: "Hunger Games",
				active: true,
			},
		],
		expressions: [
			{
				id: "expr-sob",
				term: "shortness of breath",
				lookupTerm: "sob",
				regexPattern: "\\bsob\\b",
				isCaseInsensitive: true,
				targetAssignment: "assessment.concept",
				conceptId: "c-sob",
				priorityWeight: 1,
				active: true,
				context: { tags: ["clinical", "v2"] },
			},
			{
				id: "expr-dyspnea",
				term: "dyspnea",
				lookupTerm: "dyspnea",
				regexPattern: "\\bdyspnea\\b",
				isCaseInsensitive: true,
				targetAssignment: "assessment.concept",
				conceptId: "c-sob",
				priorityWeight: 1,
				active: true,
				context: { tags: ["clinical", "v2"] },
			},
			{
				id: "expr-febrile",
				term: "febrile",
				lookupTerm: "febrile",
				regexPattern: "\\bfebrile\\b",
				isCaseInsensitive: true,
				targetAssignment: "primary_diagnosis.diagnosis",
				conceptId: "c-fever",
				priorityWeight: 1,
				active: true,
				context: { tags: ["clinical", "v2"] },
			},
			{
				id: "expr-cp",
				term: "chest pain",
				lookupTerm: "cp",
				regexPattern: "\\bcp\\b",
				isCaseInsensitive: true,
				targetAssignment: "primary_diagnosis.diagnosis",
				conceptId: "c-chest-pain",
				priorityWeight: 1,
				active: true,
				context: { tags: ["clinical", "v2"] },
			},
			{
				id: "expr-harry-potter",
				term: "Harry Potter",
				lookupTerm: "harry potter",
				regexPattern: "\\bharry\\s+potter\\b",
				isCaseInsensitive: true,
				targetAssignment: "note.title",
				conceptId: "c-harry-potter",
				priorityWeight: 1,
				active: true,
				context: { tags: ["clinical", "v2"] },
			},
			{
				id: "expr-harry-potter-deathly-hallows",
				term: "Harry Potter and the Deathly Hallows",
				lookupTerm: "harry potter and the deathly hallows",
				regexPattern:
					"\\bharry\\s+potter\\s+and\\s+the\\s+deathly\\s+hallows\\b",
				isCaseInsensitive: true,
				targetAssignment: "note.title",
				conceptId: "c-deathly-hallows",
				priorityWeight: 2,
				active: true,
				context: { tags: ["clinical", "v2"] },
			},
			{
				id: "expr-hp",
				term: "Harry Potter",
				lookupTerm: "hp",
				regexPattern: "\\bhp\\b",
				isCaseInsensitive: true,
				targetAssignment: "note.title",
				conceptId: "c-harry-potter",
				priorityWeight: 1,
				active: true,
				context: { tags: ["clinical", "v2"] },
			},
			{
				id: "expr-lotr",
				term: "Lord of the Rings",
				lookupTerm: "lotr",
				regexPattern: "\\blotr\\b",
				isCaseInsensitive: true,
				targetAssignment: "note.title",
				conceptId: "c-lord-of-the-rings",
				priorityWeight: 1,
				active: true,
				context: { tags: ["clinical", "v2"] },
			},
			{
				id: "expr-hg",
				term: "Hunger Games",
				lookupTerm: "hg",
				regexPattern: "\\bhg\\b",
				isCaseInsensitive: true,
				targetAssignment: "note.title",
				conceptId: "c-hunger-games",
				priorityWeight: 1,
				active: true,
				context: { tags: ["clinical", "v2"] },
			},
		],
		...options.dictionaryConfig,
	});
	await seedDefaultMacros(options.macroStore);
	const valueRules = new ValueRuleRegistry();
	if (options.valueRules?.length)
		valueRules.register(commandProfile.profileId, options.valueRules);
	return {
		schemaRegistry: createDefaultSchemaRegistry(),
		commandProfile,
		numericalProfile,
		valueRules,
		macroStore: options.macroStore,
		dictionary: options.dictionary,
	};
}
export { _PRIMARY_DIAGNOSIS_MACRO };
