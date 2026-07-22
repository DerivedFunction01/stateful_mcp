import type { EntityStore } from "@stateful-mcp/core";
import { SEED_CONCEPT_DEFAULTS, SEED_PARSER_PROFILES } from "./defaults";
import type {
	AdministrativeStore,
	CalibrationException,
	CalibrationStore,
	ClinicalProseTemplate,
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

export class ClinicalParserProfileStore implements ParserProfileStore {
	constructor(private store: EntityStore<ParserSyntaxProfile>) {
		void this.seed();
	}

	private async seed(): Promise<void> {
		const list = await this.store.list();
		if (list.length === 0) {
			for (const profile of SEED_PARSER_PROFILES) {
				await this.store.set(profile.profileId, profile);
			}
		}
	}

	async get(profileId: string): Promise<ParserSyntaxProfile | null> {
		return this.store.get(profileId);
	}

	async getByPersonnel(
		personnelId: string,
	): Promise<ParserSyntaxProfile | null> {
		const list = await this.store.list();
		return list.find((p) => p.personnelId === personnelId) || null;
	}

	async set(profile: ParserSyntaxProfile): Promise<void> {
		await this.store.set(profile.profileId, profile);
	}

	async delete(profileId: string): Promise<void> {
		await this.store.delete(profileId);
	}
}

export class ClinicalParserConceptDefaultStore
	implements ParserConceptDefaultStore
{
	constructor(private store: EntityStore<ParserConceptDefault>) {
		void this.seed();
	}

	private async seed(): Promise<void> {
		const list = await this.store.list();
		if (list.length === 0) {
			for (const record of SEED_CONCEPT_DEFAULTS) {
				const key = `${record.anchorConceptId}:${record.targetSchema}`;
				await this.store.set(key, record);
			}
		}
	}

	async get(
		anchorConceptId: string,
		targetSchema: string,
	): Promise<ParserConceptDefault | null> {
		const key = `${anchorConceptId}:${targetSchema}`;
		return this.store.get(key);
	}

	async listBySchema(targetSchema: string): Promise<ParserConceptDefault[]> {
		const list = await this.store.list();
		return list.filter((d) => d.targetSchema === targetSchema);
	}

	async set(record: ParserConceptDefault): Promise<void> {
		const key = `${record.anchorConceptId}:${record.targetSchema}`;
		await this.store.set(key, record);
	}
}

export class ClinicalCalibrationStore implements CalibrationStore {
	private counter = 0;

	constructor(private store: EntityStore<CalibrationException>) {}

	async logException(
		exception: Omit<
			CalibrationException,
			"exceptionId" | "createdAt" | "status"
		>,
	): Promise<string> {
		const id = `exc_${Date.now()}_${++this.counter}`;
		const record: CalibrationException = {
			...exception,
			exceptionId: id,
			status: "pending",
			createdAt: new Date().toISOString(),
		};
		await this.store.set(id, record);
		return id;
	}

	async listPending(personnelId?: string): Promise<CalibrationException[]> {
		const list = await this.store.list();
		return list.filter((e) => {
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
		const record = await this.store.get(exceptionId);
		if (record) {
			record.status = status;
			if (conceptId) record.suggestedConceptId = conceptId;
			await this.store.set(exceptionId, record);
		}
	}
}

export class ClinicalProseTemplateStore {
	constructor(private store: EntityStore<ClinicalProseTemplate>) {}

	async getTemplate(
		schema: string,
		position: "opening" | "continuing" | "closing" | "full_paragraph",
		conceptId?: string,
		workspaceId?: string,
	): Promise<ClinicalProseTemplate | null> {
		const list = await this.store.list();

		const findMatch = (
			c: string | undefined,
			w: string | undefined,
		): ClinicalProseTemplate | undefined => {
			const targetC = c || "base";
			const targetW = w || "global";
			return list.find((t) => {
				if (t.targetSchema !== schema || t.slotPosition !== position)
					return false;
				return (
					(t.targetConceptId || "base") === targetC &&
					(t.workspaceId || "global") === targetW
				);
			});
		};

		if (conceptId && workspaceId) {
			const found = findMatch(conceptId, workspaceId);
			if (found) return found;
		}
		if (conceptId) {
			const found = findMatch(conceptId, undefined);
			if (found) return found;
		}
		if (workspaceId) {
			const found = findMatch(undefined, workspaceId);
			if (found) return found;
		}
		return findMatch(undefined, undefined) || null;
	}

	async setTemplate(template: ClinicalProseTemplate): Promise<void> {
		const key = `${template.templateId}`;
		await this.store.set(key, template);
	}
}

export class ClinicalSignedSoapNoteStore implements SignedSoapNoteStore {
	constructor(private store: EntityStore<SignedSoapNoteRecord>) {}

	async archive(
		record: Omit<SignedSoapNoteRecord, "createdAt">,
	): Promise<void> {
		const fullRecord: SignedSoapNoteRecord = {
			...record,
			createdAt: new Date().toISOString(),
		};
		await this.store.set(record.noteId, fullRecord);
	}

	async get(noteId: string): Promise<SignedSoapNoteRecord | null> {
		return this.store.get(noteId);
	}

	async getBySession(sessionId: string): Promise<SignedSoapNoteRecord | null> {
		const list = await this.store.list();
		return list.find((r) => r.sessionId === sessionId) || null;
	}

	async listForPatient(patientId: string): Promise<SignedSoapNoteRecord[]> {
		const list = await this.store.list();
		return list.filter((r) => r.patientId === patientId);
	}
}

export class ClinicalAdministrativeStore implements AdministrativeStore {
	constructor(
		private personnelStore: EntityStore<Personnel>,
		private facilityStore: EntityStore<Facility>,
	) {}

	async getPersonnel(id: string): Promise<Personnel | null> {
		return this.personnelStore.get(id);
	}

	async getFacility(id: string): Promise<Facility | null> {
		return this.facilityStore.get(id);
	}

	async setPersonnel(personnel: Personnel): Promise<void> {
		await this.personnelStore.set(personnel.personnelId, personnel);
	}

	async setFacility(facility: Facility): Promise<void> {
		await this.facilityStore.set(facility.facilityId, facility);
	}
}

export class ClinicalJurisdictionalDisplayStore
	implements JurisdictionalDisplayStore
{
	constructor(private store: EntityStore<JurisdictionalDisplay>) {}

	async getPreferredDisplay(
		conceptId: string,
		jurisdictionCode: string,
	): Promise<string | null> {
		const key = `${conceptId}:${jurisdictionCode}`;
		const display = await this.store.get(key);
		return display ? display.preferredDisplay : null;
	}

	async setJurisdictionalDisplay(
		display: JurisdictionalDisplay,
	): Promise<void> {
		const key = `${display.conceptId}:${display.jurisdictionCode}`;
		await this.store.set(key, display);
	}
}

export class ClinicalStopWordStore implements StopWordStore {
	constructor(private store: EntityStore<StopWordProfile>) {}

	async getProfile(personnelId: string): Promise<StopWordProfile | null> {
		const list = await this.store.list();
		return list.find((p) => p.personnelId === personnelId) || null;
	}

	async setProfile(profile: StopWordProfile): Promise<void> {
		await this.store.set(profile.profileId, profile);
	}

	async compileStopWords(personnelId: string): Promise<Set<string>> {
		const profile = await this.getProfile(personnelId);
		if (!profile) return new Set<string>();
		return new Set<string>(profile.customWords);
	}
}
