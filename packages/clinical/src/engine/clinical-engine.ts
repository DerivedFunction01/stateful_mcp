import type { DictionaryStore, ObjectStore } from "@stateful-mcp/core";
import { CdslParser } from "../parser/cdsl-parser";
import { TimeHelper } from "../parser/helpers/measurement-helper";
import type {
	ParsedItem,
	ParsedMedicationItem,
	ParsedObservationItem,
	ParsedVitalsItem,
} from "../parser/schema-parsers";
import type { SoapNote } from "../schemas/document";
import {
	buildPatientLearningBucket,
	type PatientProfile,
} from "../schemas/patient";
import type {
	CalibrationStore,
	ParserProfileStore,
	ParserSyntaxProfile,
	SignedSoapNoteRecord,
	SignedSoapNoteStore,
	StopWordContext,
	StopWordStore,
} from "../store/interfaces";
import type {
	ParsedCellHistoryStore,
	ParsedCellRecord,
	ParsedCellStore,
} from "../store/learning/interfaces";
import {
	MAX_ORDERED_TOKENS,
	type OrderedLearningHistoryKey,
	type OrderedLearningStore,
	type OrderedLearningToken,
	scoreRecency,
} from "../store/learning/interfaces";
import { OrderedLearningRanker } from "../store/learning/ordered_learning/ordered-learning-ranking";
import type { OrderedLearningRankedCandidate } from "../store/learning/ordered_learning/ordered-learning-ranking-types";

// ── Order-Aware Projection ───────────────────────────────────────────────────

export interface OrderAwareProjection {
	storeId: string;
	rankedCandidate: OrderedLearningRankedCandidate | null;
}

/**
 * Builds an ordered token sequence from any parsed item.
 * Produces tokens for tag, concept, and each scalar field in extractedData.
 */
export function buildOrderedTokens(
	item: ParsedItem,
	startIndex: number = 0,
): OrderedLearningToken[] {
	const tokens: OrderedLearningToken[] = [];
	let idx = startIndex;

	// tag
	tokens.push({ kind: "tag", key: item.tag, index: idx++ });

	// concept
	if (item.concept[0]?.conceptId) {
		tokens.push({
			kind: "concept",
			key: item.concept[0].conceptId,
			value: item.concept[0].display,
			index: idx++,
		});
	}

	// all scalar fields present in extractedData
	const extracted = item.extractedData ?? {};
	for (const key of Object.keys(extracted)) {
		const val = extracted[key];
		if (val !== undefined && val !== null && typeof val !== "object") {
			tokens.push({
				kind: "field",
				key,
				value: String(val),
				index: idx++,
			});
		}
	}

	return tokens.slice(0, MAX_ORDERED_TOKENS);
}

// ── Engine ───────────────────────────────────────────────────────────────────

export class ClinicalEngine {
	private parser: CdslParser;

	constructor(
		private objectStore: ObjectStore,
		dictionaryStore: DictionaryStore,
		private signedNoteStore: SignedSoapNoteStore,
		private calibrationStore?: CalibrationStore,
		private parsedCellStore?: ParsedCellStore,
		stopWordStore?: StopWordStore,
		profile?: ParserSyntaxProfile,
		profileStore?: ParserProfileStore,
		private orderAwareStore?: OrderedLearningStore,
	) {
		if (profile) {
			this.parser = new CdslParser(
				dictionaryStore,
				profile,
				undefined,
				undefined,
				stopWordStore,
			);
		} else if (profileStore) {
			// Defer initialization — lazy init on first use
			this.parser = null as unknown as CdslParser;
		} else {
			// Fallback: create with no profile — callers must use create() factory
			this.parser = new CdslParser(
				dictionaryStore,
				{} as ParserSyntaxProfile,
				undefined,
				undefined,
				stopWordStore,
			);
		}
	}

	/**
	 * Creates a ClinicalEngine with a parser profile resolved from a store.
	 */
	static async create(
		objectStore: ObjectStore,
		dictionaryStore: DictionaryStore,
		signedNoteStore: SignedSoapNoteStore,
		profileStore: ParserProfileStore,
		profileId: string = "default",
		calibrationStore?: CalibrationStore,
		parsedCellStore?: ParsedCellStore,
		stopWordStore?: StopWordStore,
		orderAwareStore?: OrderedLearningStore,
	): Promise<ClinicalEngine> {
		const profile = await profileStore.get(profileId);
		if (!profile) {
			throw new Error(
				`ClinicalEngine.create: parser profile "${profileId}" not found.`,
			);
		}
		const engine = new ClinicalEngine(
			objectStore,
			dictionaryStore,
			signedNoteStore,
			calibrationStore,
			parsedCellStore,
			stopWordStore,
			profile,
			undefined,
			orderAwareStore,
		);
		return engine;
	}

	/**
	 * Registers a Patient Profile and starts a new Encounter SOAP Note session.
	 */
	async initEncounter(
		sessionId: string,
		patient: PatientProfile,
		context?: StopWordContext,
	): Promise<string> {
		// Define the base SOAP note schema rules
		const schema = {
			type: "object",
			properties: {
				id: { type: "string" },
				title: { type: "string" },
				createdAt: { type: "object" },
				updatedAt: { type: "object" },
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

		// Register template schema in ObjectStore if not already registered
		const storeAny = this.objectStore as any;
		if (
			!storeAny.hasSchema?.("SoapNote") &&
			!storeAny.schemas?.has("SoapNote")
		) {
			try {
				this.objectStore.registerSchema("SoapNote", schema);
			} catch (_) {
				// Fallback in case schema is registered under the hood
			}
		}

		const noteId = `note_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
		const now = TimeHelper.getCurrentTimestamp();
		const note: SoapNote = {
			id: noteId,
			title: `Encounter Note - ${patient.name.primaryOrSurname}`,
			createdAt: now,
			updatedAt: now,
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
		const patientBucket = buildPatientLearningBucket(note.patient);
		const historyStore = this.parsedCellStore as
			| ParsedCellHistoryStore
			| undefined;

		const parsedItems = historyStore
			? await this.parser.parseWithHistory(
					dictation,
					{
						personnelId: "system",
						patientContext: patientBucket,
					},
					historyStore,
				)
			: await this.parser.parse(dictation, {
					personnelId: "system",
					patientContext: patientBucket,
				});

		let currentObjId = "active_note";

		for (const item of parsedItems) {
			if (this.parsedCellStore) {
				const cellId = `cell_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
				const now = new Date().toISOString();
				const parsedCell: ParsedCellRecord = {
					shared: {
						cellId,
						sessionId,
						patientId: patientBucket.patientId,
						patientOrganismType: patientBucket.organismType,
						patientGender: patientBucket.gender,
						patientAgeBucket: patientBucket.ageBucket,
						patientSpeciesBucket: patientBucket.speciesBucket,
						patientSubBucket: patientBucket.subBucket,
						patientBucketKey: patientBucket.bucketKey,
						patientTierWeights: patientBucket.weights,
						personnelId: "system",
						tag: item.tag,
						targetSchema: item.targetSchema,
						rawText: item.rawText,
						anchorText: item.tag,
						parserVersion: "phase2",
						contractVersion: "v1",
						sourceKind: "direct_contract",
						outcome: "accepted",
						acceptedAt: now,
						createdAt: now,
						updatedAt: now,
					},
					parsedItem: item,
					learningMetadata: {
						history: {
							priorAcceptCount: 1,
							priorCorrectionCount: 0,
							lastAcceptedAt: now,
							recencyScore: scoreRecency(now),
						},
						flags: {
							contractValid: true,
							stalePreference: false,
							reviewRequired: false,
						},
						candidateTokens: [],
					},
				};
				await this.parsedCellStore.putRecord(parsedCell);

				// Persist ordered tokens to the order-aware store
				if (this.orderAwareStore) {
					const orderedTokens = buildOrderedTokens(item);
					await this.orderAwareStore.putRecord({
						shared: {
							cellId,
							soapNoteId: note.id,
							tag: item.tag,
							targetSchema: item.targetSchema,
							rawText: item.rawText,
							patientId: patientBucket.patientId,
							patientOrganismType: patientBucket.organismType,
							patientGender: patientBucket.gender,
							patientAgeBucket: patientBucket.ageBucket,
							patientSpeciesBucket: patientBucket.speciesBucket,
							patientSubBucket: patientBucket.subBucket,
							patientBucketKey: patientBucket.bucketKey,
							personnelId: "system",
							acceptedAt: now,
						},
						parsedItem: item,
						orderedTokens,
					});
				}
			}
			// Log calibration if concept is not found
			if (!item.concept[0]?.conceptId && this.calibrationStore) {
				await this.calibrationStore.logException({
					personnelId: "system",
					rawTerm: item.tag,
					contextSnippet: item.rawText,
				});
			}

			// Route items to their respective SOAP Note properties using targetSchema names dynamically
			const schemaClean = item.targetSchema.toLowerCase();

			if (schemaClean === "vitalsmeasurementevent") {
				const vitalsItem = item as ParsedVitalsItem;
				const vitals = [...(note.objective?.vitals || [])];
				const unit = vitalsItem.extractedData?.measurement?.unit?.display || "";
				const vitConcept = vitalsItem.concept[0];

				vitals.push({
					id: `vit_${crypto.randomUUID().slice(0, 8)}`,
					soapSection: "objective",
					concept: {
						conceptId: vitConcept?.conceptId,
						display: vitConcept?.display,
					},
					measurement: {
						magnitude: Number(
							vitalsItem.extractedData?.measurement?.magnitude || 0,
						),
						unit: { display: unit },
					},
				} as any);
				currentObjId = await this.objectStore.set(
					currentObjId,
					["objective", "vitals"],
					vitals,
					sessionId,
				);
			} else if (schemaClean === "observationevent") {
				const obsItem = item as ParsedObservationItem;
				const obsConcept = obsItem.concept[0];
				const isNegated = obsItem.extractedData?.certainty === "refuted";
				const section = isNegated ? "subjective" : "objective";

				if (section === "subjective") {
					const obs = [...(note.subjective?.observations || [])];
					obs.push({
						id: `obs_${crypto.randomUUID().slice(0, 8)}`,
						soapSection: "subjective",
						concept: {
							conceptId: obsConcept?.conceptId,
							display: obsConcept?.display,
						},
						rawTerm: obsItem.tag,
						sourceType: "patient_reported",
						certainty: obsItem.extractedData?.certainty as any,
						status: obsItem.extractedData?.status as any,
						severity: { score: 0, maxScore: 0, normalizedScore: 0 },
						duration: { magnitude: 1 },
						trajectory: "stable",
					} as any);
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
						concept: {
							conceptId: obsConcept?.conceptId,
							display: obsConcept?.display,
						},
						rawTerm: obsItem.tag,
						sourceType: "clinician_observed",
						certainty: obsItem.extractedData?.certainty as any,
						status: obsItem.extractedData?.status as any,
						severity: { score: 0, maxScore: 0, normalizedScore: 0 },
						duration: { magnitude: 1 },
						trajectory: "stable",
					} as any);
					currentObjId = await this.objectStore.set(
						currentObjId,
						["objective", "observations"],
						obs,
						sessionId,
					);
				}
			} else if (schemaClean === "medicationorderobject") {
				const medItem = item as ParsedMedicationItem;
				const medConcept = medItem.concept[0];
				const meds = [...(note.plan?.medications || [])];
				meds.push({
					id: `med_${crypto.randomUUID().slice(0, 8)}`,
					soapSection: "plan",
					medication: {
						conceptId: medConcept?.conceptId,
						display: medConcept?.display,
					},
					route: medItem.extractedData?.route as any,
					frequency: medItem.extractedData?.frequency,
				} as any);
				currentObjId = await this.objectStore.set(
					currentObjId,
					["plan", "medications"],
					meds,
					sessionId,
				);
			}
		}

		const updatedAt = TimeHelper.getCurrentTimestamp();
		currentObjId = await this.objectStore.set(
			currentObjId,
			["updatedAt"],
			updatedAt,
			sessionId,
		);

		const updatedObj = await this.objectStore.getObject(
			"active_note",
			sessionId,
		);
		return updatedObj!.data as SoapNote;
	}

	/**
	 * Computes the order-aware ranking projection for a given observation parse.
	 * Returns null if no order-aware store is configured or history is empty.
	 */
	async getOrderAwareProjection(
		key: OrderedLearningHistoryKey,
		candidateTokens: OrderedLearningToken[],
		storeId: string = "default",
	): Promise<OrderAwareProjection | null> {
		if (!this.orderAwareStore) return null;

		const ranker = new OrderedLearningRanker();
		const rankedCandidate = await ranker.rankCandidate(
			this.orderAwareStore,
			{ key, candidateTokens },
			{ adapterId: storeId },
		);

		return {
			storeId,
			rankedCandidate,
		};
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
		const updatedAt = TimeHelper.getCurrentTimestamp();
		currentObjId = await this.objectStore.set(
			currentObjId,
			["updatedAt"],
			updatedAt,
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
