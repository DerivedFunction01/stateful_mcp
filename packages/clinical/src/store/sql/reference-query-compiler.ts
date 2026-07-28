import {
	type CompiledQuery,
	QueryCompiler,
	type QueryCondition,
	type SqlDialect,
} from "@stateful-mcp/core";

export class ReferenceQueryCompiler {
	private readonly dialect: SqlDialect;
	private readonly compiler: QueryCompiler;

	constructor(dialect: SqlDialect = "postgres") {
		this.dialect = dialect;
		this.compiler = new QueryCompiler(dialect);
	}

	// ── Tags ────────────────────────────────────────────────────────────────────

	public getTagsTableDDL(table: string): CompiledQuery {
		return this.compiler.compileCreateTable({
			table,
			ifNotExists: true,
			columns: [
				{ name: "tagId", type: "text", primaryKey: true },
				{ name: "tagName", type: "text", nullable: false, unique: true },
				{ name: "tagBlob", type: "json", nullable: false, default: "{}" },
				{
					name: "source",
					type: "text",
					nullable: false,
					default: "local",
				},
			],
		});
	}

	public compileGetTag(tagId: string, table: string): CompiledQuery {
		return this.compiler.compileSelect({
			table,
			where: [{ column: "tagId", op: "eq", value: tagId }],
		});
	}

	public compileListTags(
		table: string,
		where?: QueryCondition[],
	): CompiledQuery {
		return this.compiler.compileSelect({
			table,
			where,
			orderBy: [{ column: "tagName", direction: "ASC" }],
		});
	}

	public compileUpsertTag(
		row: Record<string, unknown>,
		table: string,
	): CompiledQuery {
		const conflictColumns = this.dialect === "sqlite" ? undefined : ["tagId"];
		return this.compiler.compileInsert({
			table,
			values: row,
			onConflict: "replace",
			conflictColumns,
		});
	}

	public compileDeleteTag(tagId: string, table: string): CompiledQuery {
		return this.compiler.compileDelete({
			table,
			where: [{ column: "tagId", op: "eq", value: tagId }],
		});
	}

	// ── Jurisdictional Displays ─────────────────────────────────────────────────

	public getJurisdictionalDisplaysTableDDL(table: string): CompiledQuery[] {
		const mainDDL = this.compiler.compileCreateTable({
			table,
			ifNotExists: true,
			primaryKey: ["conceptId", "jurisdictionId", "source"],
			columns: [
				{ name: "conceptId", type: "text", nullable: false },
				{
					name: "jurisdictionId",
					type: "text",
					nullable: false,
					raw: "REFERENCES jurisdictions(jurisdictionId)",
				},
				{ name: "preferredDisplay", type: "text", nullable: false },
				{ name: "fullySpecifiedName", type: "text", nullable: false },
				{
					name: "source",
					type: "text",
					nullable: false,
					default: "local",
				},
			],
		});
		const idx = this.compiler.compileCreateIndex({
			table,
			name: `idx_${table}_jurisdiction`,
			columns: ["jurisdictionId"],
		});
		return [mainDDL, idx];
	}

	public compileGetJurisdictionalDisplay(
		conceptId: string,
		jurisdictionId: string,
		source: string,
		table: string,
	): CompiledQuery {
		return this.compiler.compileSelect({
			table,
			where: [
				{ column: "conceptId", op: "eq", value: conceptId },
				{ column: "jurisdictionId", op: "eq", value: jurisdictionId },
				{ column: "source", op: "eq", value: source },
			],
		});
	}

	public compileListJurisdictionalDisplays(
		table: string,
		where?: QueryCondition[],
	): CompiledQuery {
		return this.compiler.compileSelect({
			table,
			where,
			orderBy: [
				{ column: "jurisdictionId", direction: "ASC" },
				{ column: "conceptId", direction: "ASC" },
			],
		});
	}

	public compileUpsertJurisdictionalDisplay(
		row: Record<string, unknown>,
		table: string,
	): CompiledQuery {
		const conflictColumns =
			this.dialect === "sqlite"
				? undefined
				: ["conceptId", "jurisdictionId", "source"];
		return this.compiler.compileInsert({
			table,
			values: row,
			onConflict: "replace",
			conflictColumns,
		});
	}

	public compileDeleteJurisdictionalDisplay(
		conceptId: string,
		jurisdictionId: string,
		source: string,
		table: string,
	): CompiledQuery {
		return this.compiler.compileDelete({
			table,
			where: [
				{ column: "conceptId", op: "eq", value: conceptId },
				{ column: "jurisdictionId", op: "eq", value: jurisdictionId },
				{ column: "source", op: "eq", value: source },
			],
		});
	}

	// ── Stop Word Profiles ──────────────────────────────────────────────────────

	public getStopWordProfilesTableDDL(table: string): CompiledQuery {
		return this.compiler.compileCreateTable({
			table,
			ifNotExists: true,
			columns: [
				{ name: "profileId", type: "text", primaryKey: true },
				{
					name: "personnelId",
					type: "text",
					nullable: false,
					raw: "REFERENCES personnel(personnelId)",
				},
				{ name: "localeFiles", type: "json" },
				{ name: "specialtyFiles", type: "json" },
				{ name: "customWords", type: "json" },
				{
					name: "source",
					type: "text",
					nullable: false,
					default: "local",
				},
			],
		});
	}

	public compileGetStopWordProfile(
		profileId: string,
		table: string,
	): CompiledQuery {
		return this.compiler.compileSelect({
			table,
			where: [{ column: "profileId", op: "eq", value: profileId }],
		});
	}

	public compileListStopWordProfiles(
		table: string,
		where?: QueryCondition[],
	): CompiledQuery {
		return this.compiler.compileSelect({
			table,
			where,
			orderBy: [{ column: "profileId", direction: "ASC" }],
		});
	}

	public compileUpsertStopWordProfile(
		row: Record<string, unknown>,
		table: string,
	): CompiledQuery {
		const conflictColumns =
			this.dialect === "sqlite" ? undefined : ["profileId"];
		return this.compiler.compileInsert({
			table,
			values: row,
			onConflict: "replace",
			conflictColumns,
		});
	}

	public compileDeleteStopWordProfile(
		profileId: string,
		table: string,
	): CompiledQuery {
		return this.compiler.compileDelete({
			table,
			where: [{ column: "profileId", op: "eq", value: profileId }],
		});
	}

	// ── Prose Parser Templates ──────────────────────────────────────────────────

	public getProseParserTemplatesTableDDL(table: string): CompiledQuery {
		return this.compiler.compileCreateTable({
			table,
			ifNotExists: true,
			columns: [
				{ name: "templateId", type: "text", primaryKey: true },
				{ name: "parentTemplateId", type: "text" },
				{ name: "targetSchema", type: "text", nullable: false },
				{ name: "sectionPattern", type: "text", nullable: false },
				{ name: "priority", type: "INTEGER" },
				{ name: "maxItems", type: "INTEGER" },
				{ name: "slotsBlob", type: "json", nullable: false },
				{ name: "remnantContextBlob", type: "json" },
				{
					name: "source",
					type: "text",
					nullable: false,
					default: "local",
				},
			],
		});
	}

	public compileGetProseParserTemplate(
		templateId: string,
		table: string,
	): CompiledQuery {
		return this.compiler.compileSelect({
			table,
			where: [{ column: "templateId", op: "eq", value: templateId }],
		});
	}

	public compileListProseParserTemplates(
		table: string,
		where?: QueryCondition[],
	): CompiledQuery {
		return this.compiler.compileSelect({
			table,
			where,
			orderBy: [{ column: "templateId", direction: "ASC" }],
		});
	}

	public compileUpsertProseParserTemplate(
		row: Record<string, unknown>,
		table: string,
	): CompiledQuery {
		const conflictColumns =
			this.dialect === "sqlite" ? undefined : ["templateId"];
		return this.compiler.compileInsert({
			table,
			values: row,
			onConflict: "replace",
			conflictColumns,
		});
	}

	public compileDeleteProseParserTemplate(
		templateId: string,
		table: string,
	): CompiledQuery {
		return this.compiler.compileDelete({
			table,
			where: [{ column: "templateId", op: "eq", value: templateId }],
		});
	}

	// ── Clinical Prose Templates ────────────────────────────────────────────────

	public getClinicalProseTemplatesTableDDL(table: string): CompiledQuery[] {
		const mainDDL = this.compiler.compileCreateTable({
			table,
			ifNotExists: true,
			columns: [
				{ name: "templateId", type: "text", primaryKey: true },
				{ name: "parentTemplateId", type: "text" },
				{ name: "targetSchema", type: "text", nullable: false },
				{ name: "targetConceptId", type: "text" },
				{ name: "workspaceId", type: "text" },
				{
					name: "specialtyId",
					type: "text",
					raw: "REFERENCES specialties(specialtyId)",
				},
				{
					name: "slotPosition",
					type: "text",
					nullable: false,
				},
				{ name: "templateText", type: "text", nullable: false },
				{
					name: "source",
					type: "text",
					nullable: false,
					default: "local",
				},
			],
		});
		const idx = this.compiler.compileCreateIndex({
			table,
			name: `idx_${table}_schema_concept`,
			columns: ["targetSchema", "targetConceptId"],
		});
		return [mainDDL, idx];
	}

	public compileGetClinicalProseTemplate(
		schema: string,
		position: string,
		conceptId?: string,
		workspaceId?: string,
		table: string = "clinical_prose_templates",
	): CompiledQuery {
		const where: QueryCondition[] = [
			{ column: "targetSchema", op: "eq", value: schema },
			{ column: "slotPosition", op: "eq", value: position },
		];

		if (conceptId) {
			where.push({ column: "targetConceptId", op: "eq", value: conceptId });
		} else {
			where.push({ column: "targetConceptId", op: "is_null" });
		}

		if (workspaceId) {
			where.push({ column: "workspaceId", op: "eq", value: workspaceId });
		}

		return this.compiler.compileSelect({
			table,
			where,
			orderBy: [{ column: "templateId", direction: "ASC" }],
			limit: 1,
		});
	}

	public compileListClinicalProseTemplates(
		table: string,
		where?: QueryCondition[],
	): CompiledQuery {
		return this.compiler.compileSelect({
			table,
			where,
			orderBy: [
				{ column: "targetSchema", direction: "ASC" },
				{ column: "slotPosition", direction: "ASC" },
			],
		});
	}

	public compileUpsertClinicalProseTemplate(
		row: Record<string, unknown>,
		table: string,
	): CompiledQuery {
		const conflictColumns =
			this.dialect === "sqlite" ? undefined : ["templateId"];
		return this.compiler.compileInsert({
			table,
			values: row,
			onConflict: "replace",
			conflictColumns,
		});
	}

	public compileDeleteClinicalProseTemplate(
		templateId: string,
		table: string,
	): CompiledQuery {
		return this.compiler.compileDelete({
			table,
			where: [{ column: "templateId", op: "eq", value: templateId }],
		});
	}

	// ── Calibration Exceptions ──────────────────────────────────────────────────

	public compileGetCalibrationException(
		exceptionId: string,
		table: string,
	): CompiledQuery {
		return this.compiler.compileSelect({
			table,
			where: [{ column: "exceptionId", op: "eq", value: exceptionId }],
		});
	}

	public compileListCalibrationExceptions(
		table: string,
		where?: QueryCondition[],
	): CompiledQuery {
		return this.compiler.compileSelect({
			table,
			where,
			orderBy: [{ column: "createdAt", direction: "DESC" }],
		});
	}

	public compileInsertCalibrationException(
		row: Record<string, unknown>,
		table: string,
	): CompiledQuery {
		return this.compiler.compileInsert({
			table,
			values: row,
		});
	}

	public compileUpdateCalibrationException(
		exceptionId: string,
		set: Record<string, unknown>,
		table: string,
	): CompiledQuery {
		return this.compiler.compileUpdate({
			table,
			set,
			where: [{ column: "exceptionId", op: "eq", value: exceptionId }],
		});
	}

	public compileDeleteCalibrationException(
		exceptionId: string,
		table: string,
	): CompiledQuery {
		return this.compiler.compileDelete({
			table,
			where: [{ column: "exceptionId", op: "eq", value: exceptionId }],
		});
	}

	// ── Personnel ───────────────────────────────────────────────────────────────

	public compileGetPersonnel(
		personnelId: string,
		table: string,
	): CompiledQuery {
		return this.compiler.compileSelect({
			table,
			where: [{ column: "personnelId", op: "eq", value: personnelId }],
		});
	}

	public compileListPersonnel(table: string): CompiledQuery {
		return this.compiler.compileSelect({
			table,
			orderBy: [{ column: "personnelId", direction: "ASC" }],
		});
	}

	public compileUpsertPersonnel(
		row: Record<string, unknown>,
		table: string,
	): CompiledQuery {
		const conflictColumns =
			this.dialect === "sqlite" ? undefined : ["personnelId"];
		return this.compiler.compileInsert({
			table,
			values: row,
			onConflict: "replace",
			conflictColumns,
		});
	}

	public compileDeletePersonnel(
		personnelId: string,
		table: string,
	): CompiledQuery {
		return this.compiler.compileDelete({
			table,
			where: [{ column: "personnelId", op: "eq", value: personnelId }],
		});
	}

	// ── Facilities ──────────────────────────────────────────────────────────────

	public compileGetFacility(facilityId: string, table: string): CompiledQuery {
		return this.compiler.compileSelect({
			table,
			where: [{ column: "facilityId", op: "eq", value: facilityId }],
		});
	}

	public compileListFacilities(table: string): CompiledQuery {
		return this.compiler.compileSelect({
			table,
			orderBy: [{ column: "facilityId", direction: "ASC" }],
		});
	}

	public compileUpsertFacility(
		row: Record<string, unknown>,
		table: string,
	): CompiledQuery {
		const conflictColumns =
			this.dialect === "sqlite" ? undefined : ["facilityId"];
		return this.compiler.compileInsert({
			table,
			values: row,
			onConflict: "replace",
			conflictColumns,
		});
	}

	public compileDeleteFacility(
		facilityId: string,
		table: string,
	): CompiledQuery {
		return this.compiler.compileDelete({
			table,
			where: [{ column: "facilityId", op: "eq", value: facilityId }],
		});
	}
}
