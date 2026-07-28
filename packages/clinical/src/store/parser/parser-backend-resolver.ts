import type { ResourceLocator, SqlDialect } from "@stateful-mcp/core";
import {
	JsonlKvBackend,
	MemoryKvBackend,
	SqlBackend,
	SqlExecutor,
} from "@stateful-mcp/core";
import type { ClinicalStoreConfig } from "../clinical-config";
import { KvCalibrationExceptionStore } from "../reference/calibration/kv-calibration-exception-store";
import { SqlCalibrationExceptionStore } from "../reference/calibration/sql-calibration-exception-store";
import { KvFacilityStore } from "../reference/facilities/kv-facility-store";
import { SqlFacilityStore } from "../reference/facilities/sql-facility-store";
import { KvJurisdictionalDisplayStore } from "../reference/jurisdictional-displays/kv-jurisdictional-display-store";
import { SqlJurisdictionalDisplayStore } from "../reference/jurisdictional-displays/sql-jurisdictional-display-store";
import { KvPersonnelStore } from "../reference/personnel/kv-personnel-store";
import { SqlPersonnelStore } from "../reference/personnel/sql-personnel-store";
import { KvClinicalProseTemplateStore } from "../reference/prose-templates/kv-clinical-prose-template-store";
import { SqlClinicalProseTemplateStore } from "../reference/prose-templates/sql-clinical-prose-template-store";
import { KvStopWordProfileStore } from "../reference/stop-words/kv-stop-word-profile-store";
import { SqlStopWordProfileStore } from "../reference/stop-words/sql-stop-word-profile-store";
import { KvConceptDefaultStore } from "./concept_defaults/kv-concept-default-store";
import { SqlConceptDefaultStore } from "./concept_defaults/sql-concept-default-store";
import { KvConceptFieldStore } from "./concept_fields/kv-concept-field-store";
import { SqlConceptFieldStore } from "./concept_fields/sql-concept-field-store";
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

function readStringOption(
	locator: ResourceLocator,
	key: "path" | "dbName" | "connectionString" | "connection",
	fallback: string,
): string {
	if (locator._type !== "adapter") return fallback;
	const options = locator.options as Record<string, unknown> | undefined;
	const value = options?.[key];
	return typeof value === "string" && value.length > 0 ? value : fallback;
}

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
	switch (adapterName) {
		case "sqlite":
			return "sqlite";
		case "pg":
			return "postgres";
		case "duckdb":
			return "duckdb";
		case "opfs":
			return "opfs";
		default:
			return "sqlite";
	}
}

// ── Profiles + tags ──────────────────────────────────────────────────────────

export async function resolveParserProfileStores(
	config: ClinicalStoreConfig,
): Promise<{
	core: KvParserProfileStore | SqlParserProfileStore;
	tags: KvProfileTagStore | SqlProfileTagStore;
}> {
	const locator = getPrimaryLocator(config, "parser_profiles");

	if (locator._type === "adapter" && locator.name === "memory") {
		const backend = new MemoryKvBackend();
		return {
			core: new KvParserProfileStore(backend),
			tags: new KvProfileTagStore(backend),
		};
	}

	if (
		locator._type === "adapter" &&
		(locator.name === "sqlite" ||
			locator.name === "pg" ||
			locator.name === "duckdb" ||
			locator.name === "opfs")
	) {
		const dialect = mapDialect(locator.name);
		const dbPath =
			readStringOption(locator, "path", "") ||
			readStringOption(locator, "dbName", "") ||
			readStringOption(locator, "connectionString", "") ||
			"./clinical-parser.sqlite";
		const backend = await SqlBackend.connect(dialect, dbPath);
		const executor = new SqlExecutor(backend);
		return {
			core: new SqlParserProfileStore(dialect, executor),
			tags: new SqlProfileTagStore(dialect, executor),
		};
	}

	if (locator._type === "adapter" && locator.name === "jsonl") {
		const basePath =
			readStringOption(locator, "path", "") || "./clinical-parser.jsonl";
		const backend = new JsonlKvBackend({ dataFilePath: basePath });
		return {
			core: new KvParserProfileStore(backend),
			tags: new KvProfileTagStore(backend),
		};
	}

	throw new Error(
		`Unsupported parser profile adapter: ${(locator as any).name ?? locator._type}`,
	);
}

// ── Rules + bindings ─────────────────────────────────────────────────────────

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
	const locator = getPrimaryLocator(config, "parser_rules");

	if (locator._type === "adapter" && locator.name === "memory") {
		const backend = new MemoryKvBackend();
		return {
			attributeRules: new KvParserAttributeRuleStore(backend),
			evaluatorRules: new KvParserEvaluatorRuleStore(backend),
			attributeBindings: new KvProfileRuleBindingStore(backend),
			evaluatorBindings: new KvProfileEvaluatorBindingStore(backend),
		};
	}

	if (
		locator._type === "adapter" &&
		(locator.name === "sqlite" ||
			locator.name === "pg" ||
			locator.name === "duckdb" ||
			locator.name === "opfs")
	) {
		const dialect = mapDialect(locator.name);
		const dbPath =
			readStringOption(locator, "path", "") ||
			readStringOption(locator, "dbName", "") ||
			readStringOption(locator, "connectionString", "") ||
			"./clinical-parser.sqlite";
		const backend = await SqlBackend.connect(dialect, dbPath);
		const executor = new SqlExecutor(backend);
		return {
			attributeRules: new SqlParserAttributeRuleStore(dialect, executor),
			evaluatorRules: new SqlParserEvaluatorRuleStore(dialect, executor),
			attributeBindings: new SqlProfileRuleBindingStore(dialect, executor),
			evaluatorBindings: new SqlProfileEvaluatorBindingStore(dialect, executor),
		};
	}

	if (locator._type === "adapter" && locator.name === "jsonl") {
		const basePath =
			readStringOption(locator, "path", "") || "./clinical-parser.jsonl";
		const backend = new JsonlKvBackend({ dataFilePath: basePath });
		return {
			attributeRules: new KvParserAttributeRuleStore(backend),
			evaluatorRules: new KvParserEvaluatorRuleStore(backend),
			attributeBindings: new KvProfileRuleBindingStore(backend),
			evaluatorBindings: new KvProfileEvaluatorBindingStore(backend),
		};
	}

	throw new Error(
		`Unsupported parser rule adapter: ${(locator as any).name ?? locator._type}`,
	);
}

// ── Reference data ───────────────────────────────────────────────────────────

export async function resolveReferenceStores(
	config: ClinicalStoreConfig,
): Promise<{
	tags: KvTagStore | SqlTagStore;
	jurisdictionalDisplays:
		| KvJurisdictionalDisplayStore
		| SqlJurisdictionalDisplayStore;
	stopWordProfiles: KvStopWordProfileStore | SqlStopWordProfileStore;
	proseTemplates: KvClinicalProseTemplateStore | SqlClinicalProseTemplateStore;
}> {
	const locator = getPrimaryLocator(config, "reference");

	if (locator._type === "adapter" && locator.name === "memory") {
		const backend = new MemoryKvBackend();
		return {
			tags: new KvTagStore(backend),
			jurisdictionalDisplays: new KvJurisdictionalDisplayStore(backend),
			stopWordProfiles: new KvStopWordProfileStore(backend),
			proseTemplates: new KvClinicalProseTemplateStore(backend),
		};
	}

	if (
		locator._type === "adapter" &&
		(locator.name === "sqlite" ||
			locator.name === "pg" ||
			locator.name === "duckdb" ||
			locator.name === "opfs")
	) {
		const dialect = mapDialect(locator.name);
		const dbPath =
			readStringOption(locator, "path", "") ||
			readStringOption(locator, "dbName", "") ||
			readStringOption(locator, "connectionString", "") ||
			"./clinical-reference.sqlite";
		const backend = await SqlBackend.connect(dialect, dbPath);
		const executor = new SqlExecutor(backend);
		return {
			tags: new SqlTagStore(dialect, executor),
			jurisdictionalDisplays: new SqlJurisdictionalDisplayStore(
				dialect,
				executor,
			),
			stopWordProfiles: new SqlStopWordProfileStore(dialect, executor),
			proseTemplates: new SqlClinicalProseTemplateStore(dialect, executor),
		};
	}

	if (locator._type === "adapter" && locator.name === "jsonl") {
		const basePath =
			readStringOption(locator, "path", "") || "./clinical-reference.jsonl";
		const backend = new JsonlKvBackend({ dataFilePath: basePath });
		return {
			tags: new KvTagStore(backend),
			jurisdictionalDisplays: new KvJurisdictionalDisplayStore(backend),
			stopWordProfiles: new KvStopWordProfileStore(backend),
			proseTemplates: new KvClinicalProseTemplateStore(backend),
		};
	}

	throw new Error(
		`Unsupported reference adapter: ${(locator as any).name ?? locator._type}`,
	);
}

// ── Concept defaults ─────────────────────────────────────────────────────────

export async function resolveConceptDefaultStore(
	config: ClinicalStoreConfig,
	sharedSqlBackend?: SqlBackend,
): Promise<KvConceptDefaultStore | SqlConceptDefaultStore> {
	const locator = getPrimaryLocator(config, "concept_defaults");

	if (locator._type === "adapter" && locator.name === "memory") {
		return new KvConceptDefaultStore(new MemoryKvBackend());
	}

	if (
		locator._type === "adapter" &&
		(locator.name === "sqlite" ||
			locator.name === "pg" ||
			locator.name === "duckdb" ||
			locator.name === "opfs")
	) {
		const dialect = mapDialect(locator.name);
		const backend =
			sharedSqlBackend ??
			(await SqlBackend.connect(dialect, resolveDbPath(locator, dialect)));
		const executor = new SqlExecutor(backend);
		return new SqlConceptDefaultStore(dialect, executor);
	}

	if (locator._type === "adapter" && locator.name === "jsonl") {
		const basePath =
			readStringOption(locator, "path", "") ||
			"./clinical-concept-defaults.jsonl";
		return new KvConceptDefaultStore(
			new JsonlKvBackend({ dataFilePath: basePath }),
		);
	}

	throw new Error(
		`Unsupported concept default adapter: ${(locator as any).name ?? locator._type}`,
	);
}


// ── Concept field routing rules ──────────────────────────────────────────────

export async function resolveConceptFieldStore(
	config: ClinicalStoreConfig,
): Promise<KvConceptFieldStore | SqlConceptFieldStore> {
	const locator = getPrimaryLocator(config, "concept_fields");

	if (locator._type === "adapter" && locator.name === "memory") {
		return new KvConceptFieldStore(new MemoryKvBackend());
	}

	if (
		locator._type === "adapter" &&
		(locator.name === "sqlite" ||
			locator.name === "pg" ||
			locator.name === "duckdb" ||
			locator.name === "opfs")
	) {
		const dialect = mapDialect(locator.name);
		const backend = await SqlBackend.connect(
			dialect,
			resolveDbPath(locator, dialect),
		);
		const executor = new SqlExecutor(backend);
		return new SqlConceptFieldStore(dialect, executor);
	}

	if (locator._type === "adapter" && locator.name === "jsonl") {
		const basePath =
			readStringOption(locator, "path", "") ||
			"./clinical-concept-fields.jsonl";
		return new KvConceptFieldStore(
			new JsonlKvBackend({ dataFilePath: basePath }),
		);
	}

	throw new Error(
		`Unsupported concept field adapter: ${(locator as any).name ?? locator._type}`,
	);
}

function resolveDbPath(locator: ResourceLocator, dialect: SqlDialect): string {
	if (dialect === "postgres") {
		return (
			readStringOption(locator, "connectionString", "") ||
			readStringOption(locator, "connection", "") ||
			"./clinical.sqlite"
		);
	}
	return (
		readStringOption(locator, "path", "") ||
		readStringOption(locator, "dbName", "") ||
		"./clinical.sqlite"
	);
}

// ── Calibration exceptions ───────────────────────────────────────────────────

export async function resolveCalibrationExceptionStore(
	config: ClinicalStoreConfig,
): Promise<KvCalibrationExceptionStore | SqlCalibrationExceptionStore> {
	const locator = getPrimaryLocator(config, "calibration");

	if (locator._type === "adapter" && locator.name === "memory") {
		return new KvCalibrationExceptionStore(new MemoryKvBackend());
	}

	if (
		locator._type === "adapter" &&
		(locator.name === "sqlite" ||
			locator.name === "pg" ||
			locator.name === "duckdb" ||
			locator.name === "opfs")
	) {
		const dialect = mapDialect(locator.name);
		const backend = await SqlBackend.connect(
			dialect,
			resolveDbPath(locator, dialect),
		);
		return new SqlCalibrationExceptionStore(dialect, new SqlExecutor(backend));
	}

	if (locator._type === "adapter" && locator.name === "jsonl") {
		const basePath =
			readStringOption(locator, "path", "") || "./clinical-calibration.jsonl";
		return new KvCalibrationExceptionStore(
			new JsonlKvBackend({ dataFilePath: basePath }),
		);
	}

	throw new Error(
		`Unsupported calibration adapter: ${(locator as any).name ?? locator._type}`,
	);
}

// ── Personnel ────────────────────────────────────────────────────────────────

export async function resolvePersonnelStore(
	config: ClinicalStoreConfig,
): Promise<KvPersonnelStore | SqlPersonnelStore> {
	const locator = getPrimaryLocator(config, "personnel");

	if (locator._type === "adapter" && locator.name === "memory") {
		return new KvPersonnelStore(new MemoryKvBackend());
	}

	if (
		locator._type === "adapter" &&
		(locator.name === "sqlite" ||
			locator.name === "pg" ||
			locator.name === "duckdb" ||
			locator.name === "opfs")
	) {
		const dialect = mapDialect(locator.name);
		const backend = await SqlBackend.connect(
			dialect,
			resolveDbPath(locator, dialect),
		);
		return new SqlPersonnelStore(dialect, new SqlExecutor(backend));
	}

	if (locator._type === "adapter" && locator.name === "jsonl") {
		const basePath =
			readStringOption(locator, "path", "") || "./clinical-personnel.jsonl";
		return new KvPersonnelStore(new JsonlKvBackend({ dataFilePath: basePath }));
	}

	throw new Error(
		`Unsupported personnel adapter: ${(locator as any).name ?? locator._type}`,
	);
}

// ── Facilities ───────────────────────────────────────────────────────────────

export async function resolveFacilityStore(
	config: ClinicalStoreConfig,
): Promise<KvFacilityStore | SqlFacilityStore> {
	const locator = getPrimaryLocator(config, "facilities");

	if (locator._type === "adapter" && locator.name === "memory") {
		return new KvFacilityStore(new MemoryKvBackend());
	}

	if (
		locator._type === "adapter" &&
		(locator.name === "sqlite" ||
			locator.name === "pg" ||
			locator.name === "duckdb" ||
			locator.name === "opfs")
	) {
		const dialect = mapDialect(locator.name);
		const backend = await SqlBackend.connect(
			dialect,
			resolveDbPath(locator, dialect),
		);
		return new SqlFacilityStore(dialect, new SqlExecutor(backend));
	}

	if (locator._type === "adapter" && locator.name === "jsonl") {
		const basePath =
			readStringOption(locator, "path", "") || "./clinical-facilities.jsonl";
		return new KvFacilityStore(new JsonlKvBackend({ dataFilePath: basePath }));
	}

	throw new Error(
		`Unsupported facility adapter: ${(locator as any).name ?? locator._type}`,
	);
}
