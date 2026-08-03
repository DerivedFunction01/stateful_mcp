import { describe, expect, it } from "bun:test";
import { CdslParser } from "../src/parser/cdsl-parser";
import { CommandAutocompleteSuggester } from "../src/parser/command/command-autocomplete-suggester";
import type {
	ParserMacro,
	ParserMacroStore,
	ParserSyntaxProfile,
} from "../src/store/interfaces";
import type {
	AutocompleteTransitionInsertPlan,
	AutocompleteTransitionKey,
	AutocompleteTransitionRecord,
	AutocompleteTransitionStore,
	SystemWeightStore,
} from "../src/store/learning/interfaces";
import type { ProfileTagStore } from "../src/store/parser/profiles/interfaces";
import type { TagRecord, TagStore } from "../src/store/parser/tags/interfaces";

// ── In-memory TagStore ─────────────────────────────────────────────

class InMemoryTagStore implements TagStore {
	private records = new Map<string, TagRecord>();

	async get(tagId: string): Promise<TagRecord | null> {
		return this.records.get(tagId) ?? null;
	}

	async list(): Promise<TagRecord[]> {
		return Array.from(this.records.values());
	}

	async set(record: TagRecord): Promise<void> {
		this.records.set(record.tagId, record);
	}

	async delete(tagId: string): Promise<void> {
		this.records.delete(tagId);
	}
}

// ── In-memory ProfileTagStore ──────────────────────────────────────

class InMemoryProfileTagStore implements ProfileTagStore {
	private profileTags = new Map<string, string[]>();

	async getProfileTags(profileId: string): Promise<string[]> {
		return this.profileTags.get(profileId) ?? [];
	}

	async setProfileTags(profileId: string, tagIds: string[]): Promise<void> {
		this.profileTags.set(profileId, tagIds);
	}

	async deleteProfileTags(profileId: string, tagIds?: string[]): Promise<void> {
		if (tagIds) {
			const existing = this.profileTags.get(profileId) ?? [];
			this.profileTags.set(
				profileId,
				existing.filter((id) => !tagIds.includes(id)),
			);
		} else {
			this.profileTags.delete(profileId);
		}
	}
}

// ── In-memory ParserMacroStore ─────────────────────────────────────

class InMemoryMacroStore implements ParserMacroStore {
	private macros = new Map<string, ParserMacro>();

	async get(macroName: string): Promise<ParserMacro | null> {
		return this.macros.get(macroName) ?? null;
	}

	async list(): Promise<ParserMacro[]> {
		return Array.from(this.macros.values());
	}

	async set(macro: ParserMacro): Promise<void> {
		this.macros.set(macro.macroName, macro);
	}

	async delete(macroId: string): Promise<void> {
		for (const [key, val] of this.macros) {
			if (val.macroId === macroId) {
				this.macros.delete(key);
				return;
			}
		}
	}
}

// ── In-memory AutocompleteTransitionStore ──────────────────────────

class InMemoryAutocompleteTransitionStore
	implements AutocompleteTransitionStore
{
	private records: AutocompleteTransitionRecord[] = [];

	async increment(plan: AutocompleteTransitionInsertPlan): Promise<void> {
		const existing = this.records.find(
			(r) =>
				r.personnelId === plan.personnelId &&
				r.templateId === plan.templateId &&
				r.fromSlot === plan.fromSlot &&
				r.toSlot === plan.toSlot &&
				r.featureKey === plan.featureKey &&
				r.featureValue === plan.featureValue,
		);
		if (existing) {
			existing.selectionCount += plan.selectionCount;
			existing.lastUpdatedAt = plan.lastUpdatedAt;
		} else {
			this.records.push({
				personnelId: plan.personnelId,
				templateId: plan.templateId,
				fromSlot: plan.fromSlot,
				toSlot: plan.toSlot,
				featureKey: plan.featureKey,
				featureValue: plan.featureValue,
				numericalValue: plan.numericalValue,
				selectionCount: plan.selectionCount,
				lastUpdatedAt: plan.lastUpdatedAt,
			});
		}
	}

	async getByFromSlot(
		key: AutocompleteTransitionKey,
	): Promise<AutocompleteTransitionRecord[]> {
		return this.records
			.filter(
				(r) =>
					r.personnelId === key.personnelId &&
					r.templateId === key.templateId &&
					r.fromSlot === key.fromSlot,
			)
			.sort(
				(a, b) =>
					new Date(b.lastUpdatedAt).getTime() -
					new Date(a.lastUpdatedAt).getTime(),
			);
	}

	async getDecayedAggregate(): Promise<Record<string, number>> {
		return {};
	}

	async getContinuousAggregate(): Promise<
		Record<string, { mu: number; sigmaSq: number }>
	> {
		return {};
	}
}

// ── In-memory SystemWeightStore ─────────────────────────────────────

class InMemorySystemWeightStore implements SystemWeightStore {
	private weights = new Map<string, number>();

	async getWeight(
		category: string,
		key: string,
		subKey?: string,
	): Promise<number> {
		const lookupKey = `${category}:${key}:${subKey ?? ""}`;
		return this.weights.get(lookupKey) ?? 0;
	}

	async setWeight(
		category: string,
		key: string,
		value: number,
		subKey?: string,
	): Promise<void> {
		const lookupKey = `${category}:${key}:${subKey ?? ""}`;
		this.weights.set(lookupKey, value);
	}

	async adjustWeight(
		category: string,
		key: string,
		delta: number,
		subKey?: string,
	): Promise<void> {
		const lookupKey = `${category}:${key}:${subKey ?? ""}`;
		const current = this.weights.get(lookupKey) ?? 0;
		this.weights.set(lookupKey, current + delta);
	}

	async getWeightsForCategory(
		category: string,
		key: string,
	): Promise<Record<string, number>> {
		const prefix = `${category}:${key}:`;
		const result: Record<string, number> = {};
		for (const [k, v] of this.weights) {
			if (k.startsWith(prefix)) {
				result[k.slice(prefix.length)] = v;
			}
		}
		return result;
	}
}

// ── Test profile ───────────────────────────────────────────────────

const TEST_PROFILE: ParserSyntaxProfile = {
	profileId: "test",
	personnelId: "test-user",
	tagToken: "#",
	stateDelimiter: "||",
	stateStartDelimiter: "|",
	stateEndDelimiter: "|",
	macroStartToken: "^",
	variableStartToken: "{",
	variableEndToken: "}",
	isDefault: false,
	tagMappings: {
		vital: "VitalsMeasurementEvent",
		observation: "ObservationEvent",
		medication: "MedicationOrderObject",
		assessment: "PrimaryDiagnosisEntry",
	},
};

// ── Helpers ────────────────────────────────────────────────────────

function makeTag(
	tagId: string,
	tagName: string,
	blob: Record<string, unknown> = {},
): TagRecord {
	return { tagId, tagName, tagBlob: JSON.stringify(blob), source: "test" };
}

// ── Tests ──────────────────────────────────────────────────────────

describe("CommandAutocompleteSuggester", () => {
	describe("suggestTags", () => {
		it("returns tags matching prefix (case-insensitive)", async () => {
			const tagStore = new InMemoryTagStore();
			await tagStore.set(makeTag("v1", "vital"));
			await tagStore.set(makeTag("v2", "vitals"));
			await tagStore.set(makeTag("o1", "observation"));

			const suggester = new CommandAutocompleteSuggester(
				tagStore,
				new InMemoryProfileTagStore(),
				TEST_PROFILE,
			);

			const results = await suggester.suggestTags("v");
			expect(results).toHaveLength(2);
			expect(results.map((r) => r.label).sort()).toEqual(["vital", "vitals"]);
		});

		it("returns empty array when no tags match prefix", async () => {
			const tagStore = new InMemoryTagStore();
			await tagStore.set(makeTag("v1", "vital"));

			const suggester = new CommandAutocompleteSuggester(
				tagStore,
				new InMemoryProfileTagStore(),
				TEST_PROFILE,
			);

			const results = await suggester.suggestTags("x");
			expect(results).toHaveLength(0);
		});

		it("returns empty array when tag store is empty", async () => {
			const suggester = new CommandAutocompleteSuggester(
				new InMemoryTagStore(),
				new InMemoryProfileTagStore(),
				TEST_PROFILE,
			);

			const results = await suggester.suggestTags("v");
			expect(results).toHaveLength(0);
		});

		it("scopes tags to profile when profileId is provided", async () => {
			const tagStore = new InMemoryTagStore();
			await tagStore.set(makeTag("v1", "vital"));
			await tagStore.set(makeTag("o1", "observation"));

			const profileTagStore = new InMemoryProfileTagStore();
			await profileTagStore.setProfileTags("test-profile", ["v1"]);

			const suggester = new CommandAutocompleteSuggester(
				tagStore,
				profileTagStore,
				TEST_PROFILE,
			);

			const results = await suggester.suggestTags("v", {
				profileId: "test-profile",
			});
			expect(results).toHaveLength(1);
			expect(results[0]!.label).toBe("vital");
		});

		it("falls back to all tags when profile has no tags", async () => {
			const tagStore = new InMemoryTagStore();
			await tagStore.set(makeTag("v1", "vital"));

			const profileTagStore = new InMemoryProfileTagStore();
			// No tags set for this profile

			const suggester = new CommandAutocompleteSuggester(
				tagStore,
				profileTagStore,
				TEST_PROFILE,
			);

			const results = await suggester.suggestTags("v", {
				profileId: "nonexistent",
			});
			expect(results).toHaveLength(1);
			expect(results[0]!.label).toBe("vital");
		});

		it("includes targetSchema from profile.tagMappings", async () => {
			const tagStore = new InMemoryTagStore();
			await tagStore.set(makeTag("v1", "vital"));

			const suggester = new CommandAutocompleteSuggester(
				tagStore,
				new InMemoryProfileTagStore(),
				TEST_PROFILE,
			);

			const results = await suggester.suggestTags("v");
			expect(results).toHaveLength(1);
			expect(results[0]!.targetSchema).toBe("VitalsMeasurementEvent");
		});

		it("insertText includes tagToken prefix and trailing space", async () => {
			const tagStore = new InMemoryTagStore();
			await tagStore.set(makeTag("v1", "vital"));

			const suggester = new CommandAutocompleteSuggester(
				tagStore,
				new InMemoryProfileTagStore(),
				TEST_PROFILE,
			);

			const results = await suggester.suggestTags("v");
			expect(results[0]!.insertText).toBe("#vital ");
		});

		it("ranks higher-priority tags above lower-priority (cold start)", async () => {
			const tagStore = new InMemoryTagStore();
			await tagStore.set(makeTag("v1", "vital", { priority: 90 }));
			await tagStore.set(makeTag("v2", "vitals", { priority: 10 }));

			const suggester = new CommandAutocompleteSuggester(
				tagStore,
				new InMemoryProfileTagStore(),
				TEST_PROFILE,
			);

			const results = await suggester.suggestTags("v");
			expect(results).toHaveLength(2);
			// "vital" has higher priority → should rank first
			expect(results[0]!.label).toBe("vital");
			expect(results[1]!.label).toBe("vitals");
		});

		it("ranks tags with domain match above non-matching (cold start)", async () => {
			const tagStore = new InMemoryTagStore();
			await tagStore.set(makeTag("v1", "vital", { domain: "vitals" }));
			await tagStore.set(
				makeTag("o1", "observation", { domain: "observation" }),
			);

			const suggester = new CommandAutocompleteSuggester(
				tagStore,
				new InMemoryProfileTagStore(),
				TEST_PROFILE,
			);

			// With recentTargetSchemas containing "VitalsMeasurementEvent",
			// the "vital" tag (domain="vitals") should rank above "observation" (domain="observation")
			const results = await suggester.suggestTags("", {
				recentTargetSchemas: ["VitalsMeasurementEvent"],
			});
			expect(results).toHaveLength(2);
			expect(results[0]!.label).toBe("vital");
		});

		it("ranks tags with affinity overlap above non-matching (cold start)", async () => {
			const tagStore = new InMemoryTagStore();
			await tagStore.set(
				makeTag("v1", "vital", {
					affinitySchemas: ["ObservationEvent"],
				}),
			);
			await tagStore.set(
				makeTag("m1", "medication", {
					affinitySchemas: ["MedicationOrderObject"],
				}),
			);

			const suggester = new CommandAutocompleteSuggester(
				tagStore,
				new InMemoryProfileTagStore(),
				TEST_PROFILE,
			);

			// With recentTargetSchemas containing "ObservationEvent",
			// "vital" (affinitySchemas=["ObservationEvent"]) should rank above "medication"
			const results = await suggester.suggestTags("", {
				recentTargetSchemas: ["ObservationEvent"],
			});
			expect(results).toHaveLength(2);
			expect(results[0]!.label).toBe("vital");
		});

		it("uses transition data when available (learned score)", async () => {
			const tagStore = new InMemoryTagStore();
			await tagStore.set(makeTag("v1", "vital"));
			await tagStore.set(makeTag("o1", "observation"));

			const transitionStore = new InMemoryAutocompleteTransitionStore();
			await transitionStore.increment({
				table: "autocomplete_transitions",
				personnelId: "test-user",
				templateId: "command",
				fromSlot: "ObservationEvent",
				toSlot: "VitalsMeasurementEvent",
				featureKey: "command_tag",
				featureValue: "v1",
				numericalValue: null,
				selectionCount: 5,
				lastUpdatedAt: new Date().toISOString(),
			});

			const suggester = new CommandAutocompleteSuggester(
				tagStore,
				new InMemoryProfileTagStore(),
				TEST_PROFILE,
				transitionStore,
			);

			const results = await suggester.suggestTags("", {
				recentTargetSchemas: ["ObservationEvent"],
				personnelId: "test-user",
			});
			expect(results).toHaveLength(2);
			// "vital" (tagId=v1) has transition data → should rank first
			expect(results[0]!.label).toBe("vital");
		});

		it("returns rankScore between 0 and 1", async () => {
			const tagStore = new InMemoryTagStore();
			await tagStore.set(makeTag("v1", "vital"));

			const suggester = new CommandAutocompleteSuggester(
				tagStore,
				new InMemoryProfileTagStore(),
				TEST_PROFILE,
			);

			const results = await suggester.suggestTags("v");
			expect(results[0]!.rankScore).toBeGreaterThanOrEqual(0);
			expect(results[0]!.rankScore).toBeLessThanOrEqual(1);
		});

		it("uses SystemWeightStore overrides when weightStore is provided", async () => {
			const tagStore = new InMemoryTagStore();
			await tagStore.set(makeTag("v1", "vital"));
			await tagStore.set(makeTag("o1", "observation"));

			const weightStore = new InMemorySystemWeightStore();
			// Set all weights explicitly to verify they are read from the store.
			// coldStartBaseWeight=0 means baseScore contributes nothing.
			// coldStartPriorityWeight=1.0 means priorityScore dominates.
			// maxPriority=100 keeps priorityScore normalized.
			await weightStore.setWeight("autocomplete", "tag", 100, "maxPriority");
			await weightStore.setWeight(
				"autocomplete",
				"tag",
				0,
				"coldStartBaseWeight",
			);
			await weightStore.setWeight(
				"autocomplete",
				"tag",
				1.0,
				"coldStartPriorityWeight",
			);
			await weightStore.setWeight(
				"autocomplete",
				"tag",
				0,
				"coldStartAffinityWeight",
			);
			await weightStore.setWeight(
				"autocomplete",
				"tag",
				0,
				"coldStartDomainWeight",
			);

			const suggester = new CommandAutocompleteSuggester(
				tagStore,
				new InMemoryProfileTagStore(),
				{ ...TEST_PROFILE, tagMappings: {} },
				undefined,
				weightStore,
			);

			// Both tags have no priority, so priorityScore = 0/100 = 0.
			// coldStartScore = baseScore*0 + 0*1.0 + 0 + 0 = 0 for both.
			// Tie-break should be alphabetical.
			const results = await suggester.suggestTags("");
			expect(results).toHaveLength(2);
			expect(results[0]!.label).toBe("observation");
			expect(results[1]!.label).toBe("vital");
		});

		it("tie-breaks alphabetically when scores are equal", async () => {
			const tagStore = new InMemoryTagStore();
			await tagStore.set(makeTag("a1", "alpha"));
			await tagStore.set(makeTag("b1", "beta"));

			const suggester = new CommandAutocompleteSuggester(
				tagStore,
				new InMemoryProfileTagStore(),
				TEST_PROFILE,
			);

			const results = await suggester.suggestTags("");
			expect(results).toHaveLength(2);
			expect(results[0]!.label).toBe("alpha");
			expect(results[1]!.label).toBe("beta");
		});
	});

	describe("suggestMacros", () => {
		it("returns macros matching prefix", async () => {
			const macroStore = new InMemoryMacroStore();
			await macroStore.set({
				macroId: "m1",
				macroName: "vitals",
				macroTemplate: "#vital Heart rate 72",
			});
			await macroStore.set({
				macroId: "m2",
				macroName: "full_exam",
				macroTemplate: "#observation ...",
			});

			const suggester = new CommandAutocompleteSuggester(
				new InMemoryTagStore(),
				new InMemoryProfileTagStore(),
				TEST_PROFILE,
				undefined,
				undefined,
				macroStore,
			);

			const results = await suggester.suggestMacros("v");
			expect(results).toHaveLength(1);
			expect(results[0]!.label).toBe("vitals");
			expect(results[0]!.kind).toBe("macro");
		});

		it("returns empty when no macro store is configured", async () => {
			const suggester = new CommandAutocompleteSuggester(
				new InMemoryTagStore(),
				new InMemoryProfileTagStore(),
				TEST_PROFILE,
			);

			const results = await suggester.suggestMacros("v");
			expect(results).toHaveLength(0);
		});

		it("insertText includes macro token prefix and trailing space", async () => {
			const macroStore = new InMemoryMacroStore();
			await macroStore.set({
				macroId: "m1",
				macroName: "vitals",
				macroTemplate: "#vital Heart rate 72",
			});

			const suggester = new CommandAutocompleteSuggester(
				new InMemoryTagStore(),
				new InMemoryProfileTagStore(),
				TEST_PROFILE,
				undefined,
				undefined,
				macroStore,
			);

			const results = await suggester.suggestMacros("v");
			expect(results[0]!.insertText).toBe("^vitals ");
		});
	});

	describe("recordTagSelection", () => {
		it("records a tag selection to the transition store", async () => {
			const transitionStore = new InMemoryAutocompleteTransitionStore();
			const suggester = new CommandAutocompleteSuggester(
				new InMemoryTagStore(),
				new InMemoryProfileTagStore(),
				TEST_PROFILE,
				transitionStore,
			);

			await suggester.recordTagSelection("v1", "VitalsMeasurementEvent", {
				recentTargetSchemas: ["ObservationEvent"],
				personnelId: "test-user",
			});

			const records = await transitionStore.getByFromSlot({
				personnelId: "test-user",
				templateId: "command",
				fromSlot: "ObservationEvent",
				toSlot: "",
				featureKey: "command_tag",
			});
			expect(records).toHaveLength(1);
			expect(records[0]!.featureValue).toBe("v1");
			expect(records[0]!.toSlot).toBe("VitalsMeasurementEvent");
			expect(records[0]!.selectionCount).toBe(1);
		});

		it("increments existing transition records", async () => {
			const transitionStore = new InMemoryAutocompleteTransitionStore();
			const suggester = new CommandAutocompleteSuggester(
				new InMemoryTagStore(),
				new InMemoryProfileTagStore(),
				TEST_PROFILE,
				transitionStore,
			);

			await suggester.recordTagSelection("v1", "VitalsMeasurementEvent", {
				recentTargetSchemas: ["ObservationEvent"],
				personnelId: "test-user",
			});
			await suggester.recordTagSelection("v1", "VitalsMeasurementEvent", {
				recentTargetSchemas: ["ObservationEvent"],
				personnelId: "test-user",
			});

			const records = await transitionStore.getByFromSlot({
				personnelId: "test-user",
				templateId: "command",
				fromSlot: "ObservationEvent",
				toSlot: "",
				featureKey: "command_tag",
			});
			expect(records).toHaveLength(1);
			expect(records[0]!.selectionCount).toBe(2);
		});
	});

	describe("recordMacroSelection", () => {
		it("records a macro selection to the transition store", async () => {
			const transitionStore = new InMemoryAutocompleteTransitionStore();
			const suggester = new CommandAutocompleteSuggester(
				new InMemoryTagStore(),
				new InMemoryProfileTagStore(),
				TEST_PROFILE,
				transitionStore,
			);

			await suggester.recordMacroSelection("vitals", {
				recentTargetSchemas: ["ObservationEvent"],
				personnelId: "test-user",
			});

			const records = await transitionStore.getByFromSlot({
				personnelId: "test-user",
				templateId: "command",
				fromSlot: "ObservationEvent",
				toSlot: "",
				featureKey: "command_macro",
			});
			expect(records).toHaveLength(1);
			expect(records[0]!.featureValue).toBe("vitals");
			expect(records[0]!.featureKey).toBe("command_macro");
		});
	});

	describe("recordSelection", () => {
		it("delegates explicit tag and macro selections", async () => {
			const transitionStore = new InMemoryAutocompleteTransitionStore();
			const suggester = new CommandAutocompleteSuggester(
				new InMemoryTagStore(),
				new InMemoryProfileTagStore(),
				TEST_PROFILE,
				transitionStore,
			);
			const context = {
				recentTargetSchemas: ["ObservationEvent"],
				personnelId: "test-user",
			};

			await suggester.recordSelection({
				kind: "tag",
				value: "v1",
				targetSchema: "VitalsMeasurementEvent",
				context,
			});
			await suggester.recordSelection({
				kind: "macro",
				value: "vitals",
				context,
			});

			const records = await transitionStore.getByFromSlot({
				personnelId: "test-user",
				templateId: "command",
				fromSlot: "ObservationEvent",
				toSlot: "",
				featureKey: "command_tag",
			});
			expect(records).toHaveLength(2);
			expect(records.map((record) => record.featureKey).sort()).toEqual([
				"command_macro",
				"command_tag",
			]);
		});
	});

	describe("suggestTerms", () => {
		it("returns empty when no dictionary store is configured", async () => {
			const suggester = new CommandAutocompleteSuggester(
				new InMemoryTagStore(),
				new InMemoryProfileTagStore(),
				TEST_PROFILE,
			);

			const results = await suggester.suggestTerms("fe");
			expect(results).toHaveLength(0);
		});

		it("returns empty when prefix is empty", async () => {
			const suggester = new CommandAutocompleteSuggester(
				new InMemoryTagStore(),
				new InMemoryProfileTagStore(),
				TEST_PROFILE,
			);

			const results = await suggester.suggestTerms("");
			expect(results).toHaveLength(0);
		});
	});

	describe("suggestVariables", () => {
		it("returns variables matching prefix from filledSlots", async () => {
			const suggester = new CommandAutocompleteSuggester(
				new InMemoryTagStore(),
				new InMemoryProfileTagStore(),
				TEST_PROFILE,
			);

			const results = await suggester.suggestVariables("pat", {
				filledSlots: { patientName: "John", patientAge: 30, diagnosis: "flu" },
			});
			expect(results).toHaveLength(2);
			expect(results.map((r) => r.label).sort()).toEqual([
				"patientAge",
				"patientName",
			]);
		});

		it("returns all variables when prefix is empty", async () => {
			const suggester = new CommandAutocompleteSuggester(
				new InMemoryTagStore(),
				new InMemoryProfileTagStore(),
				TEST_PROFILE,
			);

			const results = await suggester.suggestVariables("", {
				filledSlots: { patientName: "John", diagnosis: "flu" },
			});
			expect(results).toHaveLength(2);
		});

		it("insertText includes variable token prefix and equals sign", async () => {
			const suggester = new CommandAutocompleteSuggester(
				new InMemoryTagStore(),
				new InMemoryProfileTagStore(),
				TEST_PROFILE,
			);

			const results = await suggester.suggestVariables("pat", {
				filledSlots: { patientName: "John" },
			});
			expect(results[0]!.insertText).toBe("{patientName=");
			expect(results[0]!.kind).toBe("variable");
		});

		it("returns empty when no filledSlots are provided", async () => {
			const suggester = new CommandAutocompleteSuggester(
				new InMemoryTagStore(),
				new InMemoryProfileTagStore(),
				TEST_PROFILE,
			);

			const results = await suggester.suggestVariables("pat");
			expect(results).toHaveLength(0);
		});
	});

	describe("suggest (top-level dispatcher)", () => {
		it("dispatches to suggestTags when triggerChar matches tagToken", async () => {
			const tagStore = new InMemoryTagStore();
			await tagStore.set(makeTag("v1", "vital"));

			const suggester = new CommandAutocompleteSuggester(
				tagStore,
				new InMemoryProfileTagStore(),
				TEST_PROFILE,
			);

			const results = await suggester.suggest("#v", "#");
			expect(results).toHaveLength(1);
			expect(results[0]!.label).toBe("vital");
		});

		it("dispatches to suggestMacros when triggerChar matches macroStartToken", async () => {
			const macroStore = new InMemoryMacroStore();
			await macroStore.set({
				macroId: "m1",
				macroName: "vitals",
				macroTemplate: "#vital Heart rate 72",
			});

			const suggester = new CommandAutocompleteSuggester(
				new InMemoryTagStore(),
				new InMemoryProfileTagStore(),
				TEST_PROFILE,
				undefined,
				undefined,
				macroStore,
			);

			const results = await suggester.suggest("^v", "^");
			expect(results).toHaveLength(1);
			expect(results[0]!.label).toBe("vitals");
			expect(results[0]!.kind).toBe("macro");
		});

		it("dispatches to suggestTerms when triggerChar is @", async () => {
			const suggester = new CommandAutocompleteSuggester(
				new InMemoryTagStore(),
				new InMemoryProfileTagStore(),
				TEST_PROFILE,
			);

			// No dictionary store configured, so suggestTerms returns []
			const results = await suggester.suggest("@fe", "@");
			expect(results).toHaveLength(0);
		});

		it("dispatches to suggestVariables when triggerChar is variableStartToken", async () => {
			const suggester = new CommandAutocompleteSuggester(
				new InMemoryTagStore(),
				new InMemoryProfileTagStore(),
				TEST_PROFILE,
			);

			const results = await suggester.suggest("{patientN", "{", {
				filledSlots: { patientName: "John", patientAge: 30 },
			});
			expect(results).toHaveLength(1);
			expect(results[0]!.label).toBe("patientName");
			expect(results[0]!.kind).toBe("variable");
		});

		it("returns empty for unknown triggers", async () => {
			const suggester = new CommandAutocompleteSuggester(
				new InMemoryTagStore(),
				new InMemoryProfileTagStore(),
				TEST_PROFILE,
			);

			const results = await suggester.suggest("/cmd", "/");
			expect(results).toHaveLength(0);
		});
	});
});

describe("CdslParser command autocomplete wiring", () => {
	it("creates the command suggester from injected tag stores", async () => {
		const tagStore = new InMemoryTagStore();
		await tagStore.set(makeTag("v1", "vital"));

		const parser = new CdslParser({
			dictionaryStore: {} as any,
			profile: TEST_PROFILE,
			tagStore,
			profileTagStore: new InMemoryProfileTagStore(),
		});

		const suggestions = await parser.suggestAutocomplete("#v", {
			personnelId: "test-user",
		} as any);

		expect(suggestions[0]?.slotName).toBe("vital");
		expect(suggestions[0]?.targetSchema).toBe("VitalsMeasurementEvent");
	});
});
