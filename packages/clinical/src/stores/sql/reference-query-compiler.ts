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
				{ name: "wordListIds", type: "json" },
				{ name: "excludedWords", type: "json" },
				{ name: "additionalWords", type: "json" },
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

	public compileGetStopWordProfileByPersonnelId(
		personnelId: string,
		table: string,
	): CompiledQuery {
		return this.compiler.compileSelect({
			table,
			where: [{ column: "personnelId", op: "eq", value: personnelId }],
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

	// ── Stop Word Word Lists ─────────────────────────────────────────────────────

	public getStopWordWordListsTableDDL(table: string): CompiledQuery {
		return this.compiler.compileCreateTable({
			table,
			ifNotExists: true,
			columns: [
				{ name: "id", type: "text", primaryKey: true },
				{ name: "words", type: "json", nullable: false },
				{
					name: "source",
					type: "text",
					nullable: false,
					default: "local",
				},
			],
		});
	}

	public compileGetStopWordWordList(id: string, table: string): CompiledQuery {
		return this.compiler.compileSelect({
			table,
			where: [{ column: "id", op: "eq", value: id }],
		});
	}

	public compileListStopWordWordLists(
		table: string,
		where?: QueryCondition[],
	): CompiledQuery {
		return this.compiler.compileSelect({
			table,
			where,
			orderBy: [{ column: "id", direction: "ASC" }],
		});
	}

	public compileUpsertStopWordWordList(
		row: Record<string, unknown>,
		table: string,
	): CompiledQuery {
		const conflictColumns = this.dialect === "sqlite" ? undefined : ["id"];
		return this.compiler.compileInsert({
			table,
			values: row,
			onConflict: "replace",
			conflictColumns,
		});
	}

	public compileDeleteStopWordWordList(
		id: string,
		table: string,
	): CompiledQuery {
		return this.compiler.compileDelete({
			table,
			where: [{ column: "id", op: "eq", value: id }],
		});
	}

	// ── Clinical Prose Templates ────────────────────────────────────────────────

	public getClinicalProseTemplatesTableDDL(table: string): CompiledQuery[] {
		const mainDDL = this.compiler.compileCreateTable({
			table,
			ifNotExists: true,
			columns: [
				{ name: "templateId", type: "text", primaryKey: true },
				{ name: "templateName", type: "text", nullable: false },
				{ name: "kind", type: "text", nullable: false },
				{ name: "targetSchema", type: "text", nullable: false },
				{ name: "targetConceptId", type: "text" },
				{ name: "workspaceId", type: "text" },
				{
					name: "specialtyId",
					type: "text",
					raw: "REFERENCES specialties(specialtyId)",
				},
				{ name: "section", type: "text" },
				{ name: "slotKey", type: "text" },
				{
					name: "slotPosition",
					type: "text",
					nullable: false,
				},
				{ name: "templateText", type: "text", nullable: false },
				{ name: "slotsBlob", type: "json", nullable: false },
				{ name: "active", type: "integer", nullable: false, default: 1 },
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
		const kindIdx = this.compiler.compileCreateIndex({
			table,
			name: `idx_${table}_kind_section_slot`,
			columns: ["kind", "section", "slotKey"],
		});
		return [mainDDL, idx, kindIdx];
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

	public compileGetClinicalProseTemplateById(
		templateId: string,
		table: string = "clinical_prose_templates",
	): CompiledQuery {
		return this.compiler.compileSelect({
			table,
			where: [{ column: "templateId", op: "eq", value: templateId }],
			limit: 1,
		});
	}

	public compileListClinicalProseTemplatesBySchema(
		schema: string,
		position?: string,
		table: string = "clinical_prose_templates",
	): CompiledQuery {
		const where: QueryCondition[] = [
			{ column: "targetSchema", op: "eq", value: schema },
		];
		if (position) {
			where.push({ column: "slotPosition", op: "eq", value: position });
		}
		return this.compiler.compileSelect({
			table,
			where,
			orderBy: [{ column: "templateId", direction: "ASC" }],
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
