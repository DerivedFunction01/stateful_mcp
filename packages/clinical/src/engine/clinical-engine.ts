import type { DictionaryStore, ObjectStore } from "@stateful-mcp/core";
import { CdslParser } from "../parser/cdsl-parser";
import type { SoapNote } from "../schemas/document";
import type { PatientProfile } from "../schemas/patient";
import type {
	CalibrationStore,
	SignedSoapNoteRecord,
	SignedSoapNoteStore,
} from "../store/interfaces";

export class ClinicalEngine {
	private parser: CdslParser;

	constructor(
		private objectStore: ObjectStore,
		dictionaryStore: DictionaryStore,
		private signedNoteStore: SignedSoapNoteStore,
		private calibrationStore?: CalibrationStore,
	) {
		this.parser = new CdslParser(dictionaryStore);
	}

	/**
	 * Registers a Patient Profile and starts a new Encounter SOAP Note session.
	 */
	async initEncounter(
		sessionId: string,
		patient: PatientProfile,
	): Promise<string> {
		// Define the base SOAP note schema rules
		const schema = {
			$id: "SoapNote",
			type: "object",
			properties: {
				id: { type: "string" },
				title: { type: "string" },
				createdAt: { type: "string" },
				updatedAt: { type: "string" },
				status: { type: "string", enum: ["draft", "signed"] },
				signedBy: { type: "string" },
				patient: { type: "object" },
				subjective: { type: "object" },
				objective: { type: "object" },
				assessment: { type: "object" },
				plan: { type: "object" },
			},
			required: ["id", "status", "patient"],
		};

		// Register template schema in ObjectStore
		this.objectStore.registerSchema("SoapNote", schema);

		const noteId = `note_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
		const note: SoapNote = {
			id: noteId,
			title: `Encounter Note - ${patient.name.primaryOrSurname}`,
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
			status: "draft",
			patient,
			subjective: { observations: [], exposures: [], injuries: [] },
			objective: { vitals: [], exams: [], observations: [] },
			assessment: { diagnoses: [], observations: [] },
			plan: { medications: [], procedures: [] },
			cells: [],
		};

		// Create in Object Store
		await this.objectStore.init("SoapNote", sessionId, "active_note", note);
		return noteId;
	}

	/**
	 * Parses CDSL clinical dictation and dynamically compiles it into the active SOAP note.
	 */
	async processCdsl(sessionId: string, dictation: string): Promise<SoapNote> {
		const activeObj = await this.objectStore.getObject(
			"active_note",
			sessionId,
		);
		if (!activeObj) {
			throw new Error("No active encounter note session found.");
		}

		if (activeObj.data.status === "signed") {
			throw new Error("Cannot modify a signed SOAP note.");
		}

		const note = activeObj.data as SoapNote;
		const parsedItems = await this.parser.parse(dictation);

		let currentObjId = "active_note";

		for (const item of parsedItems) {
			// Log calibration if concept is not found
			if (!item.conceptId && this.calibrationStore) {
				await this.calibrationStore.logException({
					personnelId: "system",
					rawTerm: item.anchorText,
					contextSnippet: item.rawText,
				});
			}

			// Route items to their respective SOAP Note properties
			const tagClean = item.tag.toLowerCase();

			if (tagClean === "#vital") {
				const vitals = [...(note.objective?.vitals || [])];
				vitals.push({
					id: `vit_${crypto.randomUUID().slice(0, 8)}`,
					soapSection: "objective",
					concept: { conceptId: item.conceptId, display: item.display },
					measurement: {
						magnitude: Number(item.value || 0),
						unit: { display: item.unit || "" },
					},
				} as any);
				currentObjId = await this.objectStore.set(
					currentObjId,
					["objective", "vitals"],
					vitals,
					sessionId,
				);
			} else if (tagClean === "#observation" || tagClean === "#symptom") {
				const isNegated = item.certainty === "refuted";
				const section = isNegated ? "subjective" : "objective";

				if (section === "subjective") {
					const obs = [...(note.subjective?.observations || [])];
					obs.push({
						id: `obs_${crypto.randomUUID().slice(0, 8)}`,
						soapSection: "subjective",
						concept: { conceptId: item.conceptId, display: item.display },
						rawTerm: item.anchorText,
						sourceType: "patient_reported",
						certainty: item.certainty as any,
						status: item.status as any,
						severity: { score: 0, maxScore: 0, normalizedScore: 0 },
						duration: { magnitude: 1 },
						trajectory: "stable",
					});
					currentObjId = await this.objectStore.set(
						currentObjId,
						["subjective", "observations"],
						obs,
						sessionId,
					);
				} else {
					const obs = [...(note.objective?.observations || [])];
					obs.push({
						id: `obs_${crypto.randomUUID().slice(0, 8)}`,
						soapSection: "objective",
						concept: { conceptId: item.conceptId, display: item.display },
						rawTerm: item.anchorText,
						sourceType: "clinician_observed",
						certainty: item.certainty as any,
						status: item.status as any,
						severity: { score: 0, maxScore: 0, normalizedScore: 0 },
						duration: { magnitude: 1 },
						trajectory: "stable",
					});
					currentObjId = await this.objectStore.set(
						currentObjId,
						["objective", "observations"],
						obs,
						sessionId,
					);
				}
			} else if (tagClean === "#rx" || tagClean === "#med") {
				const meds = [...(note.plan?.medications || [])];
				meds.push({
					id: `med_${crypto.randomUUID().slice(0, 8)}`,
					soapSection: "plan",
					medication: { conceptId: item.conceptId, display: item.display },
					route: item.route as any,
					cadence: { cadenceType: item.frequency } as any,
					duration: { magnitude: 10 } as any,
				} as any);
				currentObjId = await this.objectStore.set(
					currentObjId,
					["plan", "medications"],
					meds,
					sessionId,
				);
			}
		}

		currentObjId = await this.objectStore.set(
			currentObjId,
			["updatedAt"],
			new Date().toISOString(),
			sessionId,
		);

		const updatedObj = await this.objectStore.getObject(
			"active_note",
			sessionId,
		);
		return updatedObj!.data as SoapNote;
	}

	/**
	 * Digitally signs the SOAP Note, archiving it to long-term storage and locking it.
	 */
	async signEncounter(
		sessionId: string,
		signedBy: string,
	): Promise<SignedSoapNoteRecord> {
		const activeObj = await this.objectStore.getObject(
			"active_note",
			sessionId,
		);
		if (!activeObj) {
			throw new Error("No active encounter note session found.");
		}

		if (activeObj.data.status === "signed") {
			throw new Error("Note is already signed.");
		}

		let currentObjId = "active_note";
		currentObjId = await this.objectStore.set(
			currentObjId,
			["status"],
			"signed",
			sessionId,
		);
		currentObjId = await this.objectStore.set(
			currentObjId,
			["signedBy"],
			signedBy,
			sessionId,
		);
		currentObjId = await this.objectStore.set(
			currentObjId,
			["updatedAt"],
			new Date().toISOString(),
			sessionId,
		);

		const signedObj = await this.objectStore.getObject(
			"active_note",
			sessionId,
		);
		const note = signedObj!.data as SoapNote;

		const record: SignedSoapNoteRecord = {
			noteId: note.id,
			sessionId,
			patientId: note.patient.id,
			documentVersion: 1,
			soapNoteJson: note,
			signedBy,
			createdAt: new Date().toISOString(),
		};

		// Archive to SignedSoapNoteStore
		await this.signedNoteStore.archive(record);
		return record;
	}
}
