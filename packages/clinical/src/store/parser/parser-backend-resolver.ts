import type { ResourceLocator, SqlDialect } from "@stateful-mcp/core";
import {
	JsonlKvBackend,
	MemoryKvBackend,
	readStringOption,
	resolveDbPath,
	SqlBackend,
	SqlExecutor,
} from "@stateful-mcp/core";
import type { SharedFieldAnchorStore } from "../../parser/field-shared/shared-field-anchor";
import type { ClinicalStoreConfig } from "../clinical-config";
import { KvCalibrationExceptionStore } from "../reference/calibration/kv-calibration-exception-store";
import { SqlCalibrationExceptionStore } from "../reference/calibration/sql-calibration-exception-store";
import { KvFacilityStore } from "../reference/facilities/kv-facility-store";
import { SqlFacilityStore } from "../reference/facilities/sql-facility-store";
import { KvJurisdictionalDisplayStore } from "../reference/jurisdictional-displays/kv-jurisdictional-display-store";
import { SqlJurisdictionalDisplayStore } from "../reference/jurisdictional-displays/sql-jurisdictional-display-store";
import { KvPersonnelStore } from "../reference/personnel/kv-personnel-store";
import { SqlPersonnelStore } from "../reference/personnel/sql-personnel-store";
import { KvProseParserTemplateStore } from "../reference/prose-parser-templates/kv-prose-parser-template-store";
import { SqlProseTemplateStore } from "../reference/prose-parser-templates/sql-prose-parser-template-store";
import { KvClinicalProseTemplateStore } from "../reference/prose-templates/kv-clinical-prose-template-store";
import { SqlClinicalProseTemplateStore } from "../reference/prose-templates/sql-clinical-prose-template-store";
import { KvStopWordProfileStore } from "../reference/stop-words/kv-stop-word-profile-store";
import { KvStopWordWordListStore } from "../reference/stop-words/kv-stop-word-word-list-store";
import { SqlStopWordProfileStore } from "../reference/stop-words/sql-stop-word-profile-store";
import { SqlStopWordWordListStore } from "../reference/stop-words/sql-stop-word-word-list-store";
import { KvSharedFieldAnchorStore } from "./anchors/kv-shared-field-anchor-store";
import { SqlSharedFieldAnchorStore } from "./anchors/sql-shared-field-anchor-store";
import { KvConceptDefaultStore } from "./concept_defaults/kv-concept-default-store";
import { SqlConceptDefaultStore } from "./concept_defaults/sql-concept-default-store";
import { KvConceptFieldStore } from "./concept_fields/kv-concept-field-store";
import { SqlConceptFieldStore } from "./concept_fields/sql-concept-field-store";
import { KvParserMacroStore } from "./macros/kv-macro-store";
import { SqlParserMacroStore } from "./macros/sql-macro-store";
import { KvParserProfileStore } from "./profiles/kv-parser-profile-store";
import { KvProfileTagStore } from "./profiles/kv-profile-tag-store";
import { SqlParserProfileStore } from "./profiles/sql-parser-profile-store";
import { SqlProfileTagStore } from "./profiles/sql-profile-tag-store";
import { KvParserAttributeRuleStore } from "./rules/kv-parser-attribute-rule-store";
import { KvParserEvaluatorRuleStore } from "./rules/kv-parser-evaluator-rule-store";
import { KvProfileEvaluatorBindingStore } from "./rules/kv-profile-evaluator-binding-store";
import { KvProfileRuleBindingStore } from "./rules/kv-profile-rule-binding-store";
import { SqlParserAttributeRuleStore } from "./rules/sql-parser-attribute-rule-store";
import { SqlParserEvaluatorRuleStore } from "./rules/sql-parser-evaluator-rule-store";
import { SqlProfileEvaluatorBindingStore } from "./rules/sql-profile-evaluator-binding-store";
import { SqlProfileRuleBindingStore } from "./rules/sql-profile-rule-binding-store";
import { KvTagStore } from "./tags/kv-tag-store";
import { SqlTagStore } from "./tags/sql-tag-store";

function getPrimaryLocator(
	config: ClinicalStoreConfig,
	group: string,
): ResourceLocator {
	const domain = config.domains[group];
	if (!domain?.defaultAdapters?.[0]?.primary) {
		throw new Error(`No primary adapter configured for domain: ${group}`);
	}
	return domain.defaultAdapters[0].primary;
}

function mapDialect(adapterName: string): SqlDialect {
	return adapterName as SqlDialect;
}

async function resolveStoreWithFactory(
	config: ClinicalStoreConfig,
	group: string,
	defaultFilename: string,
	factories: {
		memory: (backend: MemoryKvBackend) => any;
		sql: (
			dialect: SqlDialect,
			executor: SqlExecutor,
			backend: SqlBackend,
		) => any;
		jsonl: (backend: JsonlKvBackend) => any;
	},
	sharedSqlBackend?: SqlBackend,
): Promise<any> {
	const locator = getPrimaryLocator(config, group);

	if (locator._type !== "adapter") {
		throw new Error(
			`Unsupported store locator type: ${locator._type} for group: ${group}`,
		);
	}

	switch (locator.name) {
		case "memory": {
			return factories.memory(new MemoryKvBackend());
		}
		case "sqlite":
		case "postgres":
		case "duckdb":
		case "opfs": {
			const dialect = mapDialect(locator.name);
			const backend =
				sharedSqlBackend ??
				(await SqlBackend.connect(
					dialect,
					resolveDbPath(locator, dialect, defaultFilename),
				));
			const executor = new SqlExecutor(backend);
			return factories.sql(dialect, executor, backend);
		}
		case "jsonl": {
			const basePath = readStringOption(locator, "path", "") || defaultFilename;
			const backend = new JsonlKvBackend({ dataFilePath: basePath });
			return factories.jsonl(backend);
		}
		default:
			throw new Error(
				`Unsupported ${group} adapter: ${(locator as any).name ?? locator._type}`,
			);
	}
}

// ── Profiles + tags ──────────────────────────────────────────────────────────

export async function resolveParserProfileStores(
	config: ClinicalStoreConfig,
): Promise<{
	core: KvParserProfileStore | SqlParserProfileStore;
	tags: KvProfileTagStore | SqlProfileTagStore;
}> {
	return resolveStoreWithFactory(
		config,
		"parser_profiles",
		"./clinical-parser.sqlite",
		{
			memory: (backend) => ({
				core: new KvParserProfileStore(backend),
				tags: new KvProfileTagStore(backend),
			}),
			sql: (dialect, executor) => ({
				core: new SqlParserProfileStore(dialect, executor),
				tags: new SqlProfileTagStore(dialect, executor),
			}),
			jsonl: (backend) => ({
				core: new KvParserProfileStore(backend),
				tags: new KvProfileTagStore(backend),
			}),
		},
	);
}

// ── Rules + bindings ─────────────────────────────────────────────────

export async function resolveParserRuleStores(
	config: ClinicalStoreConfig,
): Promise<{
	attributeRules: KvParserAttributeRuleStore | SqlParserAttributeRuleStore;
	evaluatorRules: KvParserEvaluatorRuleStore | SqlParserEvaluatorRuleStore;
	attributeBindings: KvProfileRuleBindingStore | SqlProfileRuleBindingStore;
	evaluatorBindings:
		| KvProfileEvaluatorBindingStore
		| SqlProfileEvaluatorBindingStore;
}> {
	return resolveStoreWithFactory(
		config,
		"parser_rules",
		"./clinical-parser.sqlite",
		{
			memory: (backend) => ({
				attributeRules: new KvParserAttributeRuleStore(backend),
				evaluatorRules: new KvParserEvaluatorRuleStore(backend),
				attributeBindings: new KvProfileRuleBindingStore(backend),
				evaluatorBindings: new KvProfileEvaluatorBindingStore(backend),
			}),
			sql: (dialect, executor) => ({
				attributeRules: new SqlParserAttributeRuleStore(dialect, executor),
				evaluatorRules: new SqlParserEvaluatorRuleStore(dialect, executor),
				attributeBindings: new SqlProfileRuleBindingStore(dialect, executor),
				evaluatorBindings: new SqlProfileEvaluatorBindingStore(
					dialect,
					executor,
				),
			}),
			jsonl: (backend) => ({
				attributeRules: new KvParserAttributeRuleStore(backend),
				evaluatorRules: new KvParserEvaluatorRuleStore(backend),
				attributeBindings: new KvProfileRuleBindingStore(backend),
				evaluatorBindings: new KvProfileEvaluatorBindingStore(backend),
			}),
		},
	);
}

// ── Reference data ───────────────────────────────────────────────────

export async function resolveReferenceStores(
	config: ClinicalStoreConfig,
): Promise<{
	tags: KvTagStore | SqlTagStore;
	jurisdictionalDisplays:
		| KvJurisdictionalDisplayStore
		| SqlJurisdictionalDisplayStore;
	stopWordProfiles: KvStopWordProfileStore | SqlStopWordProfileStore;
	proseTemplates: KvClinicalProseTemplateStore | SqlClinicalProseTemplateStore;
	proseParserTemplates: KvProseParserTemplateStore | SqlProseTemplateStore;
}> {
	return resolveStoreWithFactory(
		config,
		"reference",
		"./clinical-reference.sqlite",
		{
			memory: (backend) => ({
				tags: new KvTagStore(backend),
				jurisdictionalDisplays: new KvJurisdictionalDisplayStore(backend),
				stopWordProfiles: new KvStopWordProfileStore(backend),
				proseTemplates: new KvClinicalProseTemplateStore(backend),
				proseParserTemplates: new KvProseParserTemplateStore(backend),
			}),
			sql: (dialect, executor) => ({
				tags: new SqlTagStore(dialect, executor),
				jurisdictionalDisplays: new SqlJurisdictionalDisplayStore(
					dialect,
					executor,
				),
				stopWordProfiles: new SqlStopWordProfileStore(dialect, executor),
				proseTemplates: new SqlClinicalProseTemplateStore(dialect, executor),
				proseParserTemplates: new SqlProseTemplateStore(dialect, executor),
			}),
			jsonl: (backend) => ({
				tags: new KvTagStore(backend),
				jurisdictionalDisplays: new KvJurisdictionalDisplayStore(backend),
				stopWordProfiles: new KvStopWordProfileStore(backend),
				proseTemplates: new KvClinicalProseTemplateStore(backend),
				proseParserTemplates: new KvProseParserTemplateStore(backend),
			}),
		},
	);
}

export async function resolveStopWordWordListStore(
	config: ClinicalStoreConfig,
): Promise<KvStopWordWordListStore | SqlStopWordWordListStore> {
	return resolveStoreWithFactory(
		config,
		"reference",
		"./clinical-reference.sqlite",
		{
			memory: (backend) => new KvStopWordWordListStore(backend),
			sql: (dialect, executor) =>
				new SqlStopWordWordListStore(dialect, executor),
			jsonl: (backend) => new KvStopWordWordListStore(backend),
		},
	);
}

// ── Concept defaults ─────────────────────────────────────────────────────────

export async function resolveConceptDefaultStore(
	config: ClinicalStoreConfig,
	sharedSqlBackend?: SqlBackend,
): Promise<KvConceptDefaultStore | SqlConceptDefaultStore> {
	return resolveStoreWithFactory(
		config,
		"concept_defaults",
		"./clinical.sqlite",
		{
			memory: (backend) => new KvConceptDefaultStore(backend),
			sql: (dialect, executor) => new SqlConceptDefaultStore(dialect, executor),
			jsonl: (backend) => new KvConceptDefaultStore(backend),
		},
		sharedSqlBackend,
	);
}

// ── Concept field routing rules ──────────────────────────────────────

export async function resolveConceptFieldStore(
	config: ClinicalStoreConfig,
): Promise<KvConceptFieldStore | SqlConceptFieldStore> {
	return resolveStoreWithFactory(
		config,
		"concept_fields",
		"./clinical.sqlite",
		{
			memory: (backend) => new KvConceptFieldStore(backend),
			sql: (dialect, executor) => new SqlConceptFieldStore(dialect, executor),
			jsonl: (backend) => new KvConceptFieldStore(backend),
		},
	);
}

// ── Shared Field Anchors ─────────────────────────────────────────────

export async function resolveSharedFieldAnchorStore(
	config: ClinicalStoreConfig,
): Promise<SharedFieldAnchorStore> {
	return resolveStoreWithFactory(
		config,
		"shared_field_anchors",
		"./clinical.sqlite",
		{
			memory: (backend) => new KvSharedFieldAnchorStore(backend),
			sql: (dialect, executor) =>
				new SqlSharedFieldAnchorStore(dialect, executor),
			jsonl: (backend) => new KvSharedFieldAnchorStore(backend),
		},
	);
}

// ── Calibration exceptions ───────────────────────────────────────────

export async function resolveCalibrationExceptionStore(
	config: ClinicalStoreConfig,
): Promise<KvCalibrationExceptionStore | SqlCalibrationExceptionStore> {
	return resolveStoreWithFactory(config, "calibration", "./clinical.sqlite", {
		memory: (backend) => new KvCalibrationExceptionStore(backend),
		sql: (dialect, executor) =>
			new SqlCalibrationExceptionStore(dialect, executor),
		jsonl: (backend) => new KvCalibrationExceptionStore(backend),
	});
}

// ── Macros ───────────────────────────────────────────────────────────

export async function resolveMacroStore(
	config: ClinicalStoreConfig,
): Promise<KvParserMacroStore | SqlParserMacroStore> {
	return resolveStoreWithFactory(
		config,
		"parser_macros",
		"./clinical-parser.sqlite",
		{
			memory: (backend) => new KvParserMacroStore(backend),
			sql: (dialect, executor) => new SqlParserMacroStore(executor),
			jsonl: (backend) => new KvParserMacroStore(backend),
		},
	);
}

// ── Personnel ────────────────────────────────────────────────────────

export async function resolvePersonnelStore(
	config: ClinicalStoreConfig,
): Promise<KvPersonnelStore | SqlPersonnelStore> {
	return resolveStoreWithFactory(config, "personnel", "./clinical.sqlite", {
		memory: (backend) => new KvPersonnelStore(backend),
		sql: (dialect, executor) => new SqlPersonnelStore(dialect, executor),
		jsonl: (backend) => new KvPersonnelStore(backend),
	});
}

// ── Facilities ───────────────────────────────────────────────────────

export async function resolveFacilityStore(
	config: ClinicalStoreConfig,
): Promise<KvFacilityStore | SqlFacilityStore> {
	return resolveStoreWithFactory(config, "facilities", "./clinical.sqlite", {
		memory: (backend) => new KvFacilityStore(backend),
		sql: (dialect, executor) => new SqlFacilityStore(dialect, executor),
		jsonl: (backend) => new KvFacilityStore(backend),
	});
}
