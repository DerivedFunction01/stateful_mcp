import type {
	AdministrativeStore,
	CalibrationException,
	CalibrationStore,
	ClinicalProseTemplate,
	ClinicalProseTemplateStore,
	Facility,
	JurisdictionalDisplay,
	JurisdictionalDisplayStore,
	ParserConceptDefault,
	ParserConceptDefaultStore,
	ParserProfileStore,
	ParserSyntaxProfile,
	Personnel,
	SignedSoapNoteRecord,
	SignedSoapNoteStore,
	StopWordProfile,
	StopWordStore,
} from "./interfaces";

export class MemoryParserProfileStore implements ParserProfileStore {
	private profiles = new Map<string, ParserSyntaxProfile>();

	async get(profileId: string): Promise<ParserSyntaxProfile | null> {
		return this.profiles.get(profileId) || null;
	}

	async getByPersonnel(
		personnelId: string,
	): Promise<ParserSyntaxProfile | null> {
		for (const p of this.profiles.values()) {
			if (p.personnelId === personnelId) return p;
		}
		return null;
	}

	async set(profile: ParserSyntaxProfile): Promise<void> {
		this.profiles.set(profile.profileId, profile);
	}

	async delete(profileId: string): Promise<void> {
		this.profiles.delete(profileId);
	}
}

export class MemoryCalibrationStore implements CalibrationStore {
	private exceptions = new Map<string, CalibrationException>();
	private counter = 0;

	async logException(
		exception: Omit<
			CalibrationException,
			"exceptionId" | "createdAt" | "status"
		>,
	): Promise<string> {
		const id = `exc_${++this.counter}`;
		const record: CalibrationException = {
			...exception,
			exceptionId: id,
			status: "pending",
			createdAt: new Date().toISOString(),
		};
		this.exceptions.set(id, record);
		return id;
	}

	async listPending(personnelId?: string): Promise<CalibrationException[]> {
		return Array.from(this.exceptions.values()).filter((e) => {
			if (e.status !== "pending") return false;
			if (personnelId && e.personnelId !== personnelId) return false;
			return true;
		});
	}

	async resolve(
		exceptionId: string,
		status: "mapped" | "ignored",
		conceptId?: string,
	): Promise<void> {
		const record = this.exceptions.get(exceptionId);
		if (record) {
			record.status = status;
			if (conceptId) record.suggestedConceptId = conceptId;
		}
	}
}

export class MemoryClinicalProseTemplateStore
	implements ClinicalProseTemplateStore
{
	private templates = new Map<string, ClinicalProseTemplate>();

	async getTemplate(
		schema: string,
		position: "opening" | "continuing" | "closing" | "full_paragraph",
		conceptId?: string,
		workspaceId?: string,
	): Promise<ClinicalProseTemplate | null> {
		// Tier 1: Schema + Concept + Workspace
		if (conceptId && workspaceId) {
			const k = `${schema}:${conceptId}:${workspaceId}:${position}`;
			if (this.templates.has(k)) return this.templates.get(k)!;
		}
		// Tier 2: Schema + Concept + Global
		if (conceptId) {
			const k = `${schema}:${conceptId}:global:${position}`;
			if (this.templates.has(k)) return this.templates.get(k)!;
		}
		// Tier 3: Schema + Base + Workspace
		if (workspaceId) {
			const k = `${schema}:base:${workspaceId}:${position}`;
			if (this.templates.has(k)) return this.templates.get(k)!;
		}
		// Tier 4: Schema + Base + Global
		const k = `${schema}:base:global:${position}`;
		return this.templates.get(k) || null;
	}

	async setTemplate(template: ClinicalProseTemplate): Promise<void> {
		const cId = template.targetConceptId || "base";
		const wId = template.workspaceId || "global";
		const k = `${template.targetSchema}:${cId}:${wId}:${template.slotPosition}`;
		this.templates.set(k, template);
	}
}

export class MemorySignedSoapNoteStore implements SignedSoapNoteStore {
	private notes = new Map<string, SignedSoapNoteRecord>();

	async archive(
		record: Omit<SignedSoapNoteRecord, "createdAt">,
	): Promise<void> {
		const fullRecord: SignedSoapNoteRecord = {
			...record,
			createdAt: new Date().toISOString(),
		};
		this.notes.set(record.noteId, fullRecord);
	}

	async get(noteId: string): Promise<SignedSoapNoteRecord | null> {
		return this.notes.get(noteId) || null;
	}

	async getBySession(sessionId: string): Promise<SignedSoapNoteRecord | null> {
		for (const r of this.notes.values()) {
			if (r.sessionId === sessionId) return r;
		}
		return null;
	}

	async listForPatient(patientId: string): Promise<SignedSoapNoteRecord[]> {
		return Array.from(this.notes.values()).filter(
			(r) => r.patientId === patientId,
		);
	}
}

export class MemoryAdministrativeStore implements AdministrativeStore {
	private personnelMap = new Map<string, Personnel>();
	private facilityMap = new Map<string, Facility>();

	async getPersonnel(id: string): Promise<Personnel | null> {
		return this.personnelMap.get(id) || null;
	}

	async getFacility(id: string): Promise<Facility | null> {
		return this.facilityMap.get(id) || null;
	}

	async setPersonnel(personnel: Personnel): Promise<void> {
		this.personnelMap.set(personnel.personnelId, personnel);
	}

	async setFacility(facility: Facility): Promise<void> {
		this.facilityMap.set(facility.facilityId, facility);
	}
}

export class MemoryJurisdictionalDisplayStore
	implements JurisdictionalDisplayStore
{
	private displays = new Map<string, JurisdictionalDisplay>();

	async getPreferredDisplay(
		conceptId: string,
		jurisdictionCode: string,
	): Promise<string | null> {
		const k = `${conceptId}:${jurisdictionCode}`;
		const display = this.displays.get(k);
		return display ? display.preferredDisplay : null;
	}

	async setJurisdictionalDisplay(
		display: JurisdictionalDisplay,
	): Promise<void> {
		const k = `${display.conceptId}:${display.jurisdictionCode}`;
		this.displays.set(k, display);
	}
}

export class MemoryStopWordStore implements StopWordStore {
	private profiles = new Map<string, StopWordProfile>();

	async getProfile(personnelId: string): Promise<StopWordProfile | null> {
		for (const p of this.profiles.values()) {
			if (p.personnelId === personnelId) return p;
		}
		return null;
	}

	async setProfile(profile: StopWordProfile): Promise<void> {
		this.profiles.set(profile.profileId, profile);
	}

	async compileStopWords(personnelId: string): Promise<Set<string>> {
		const profile = await this.getProfile(personnelId);
		if (!profile) return new Set<string>();
		// Since flat files aren't physically loaded here, we union custom words and return
		return new Set<string>(profile.customWords);
	}
}

export class MemoryParserConceptDefaultStore
	implements ParserConceptDefaultStore
{
	private defaults = new Map<string, ParserConceptDefault>();

	async get(
		anchorConceptId: string,
		targetSchema: string,
	): Promise<ParserConceptDefault | null> {
		const k = `${anchorConceptId}:${targetSchema}`;
		return this.defaults.get(k) || null;
	}

	async listBySchema(targetSchema: string): Promise<ParserConceptDefault[]> {
		return Array.from(this.defaults.values()).filter(
			(d) => d.targetSchema === targetSchema,
		);
	}

	async set(record: ParserConceptDefault): Promise<void> {
		const k = `${record.anchorConceptId}:${record.targetSchema}`;
		this.defaults.set(k, record);
	}
}
