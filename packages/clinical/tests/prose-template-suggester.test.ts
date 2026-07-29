import { describe, expect, it } from "bun:test";
import { MemoryKvBackend } from "@stateful-mcp/core";
import { ProseTemplateSuggester } from "../src/parser/prose-template-suggester";
import type { StopWordStore } from "../src/store/interfaces";
import type { ProseParserTemplateStore } from "../src/store/reference/prose-parser-templates/interfaces";
import type {
	ProseSlot,
	ProseTemplate,
} from "../src/store/reference/prose-parser-templates/prose-template";
import { DefaultStopWordStore } from "../src/store/reference/stop-words/default-stop-word-store";
import { KvStopWordProfileStore } from "../src/store/reference/stop-words/kv-stop-word-profile-store";
import { KvStopWordWordListStore } from "../src/store/reference/stop-words/kv-stop-word-word-list-store";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeKvTemplateStore(): ProseParserTemplateStore {
	const backend = new MemoryKvBackend();
	// Use dynamic require to avoid circular imports if any
	const {
		KvProseParserTemplateStore,
	} = require("../src/store/reference/prose-parser-templates/kv-prose-parser-template-store");
	return new KvProseParserTemplateStore(backend);
}

function makeKvStopWordStore(): StopWordStore {
	const backend = new MemoryKvBackend();
	const profiles = new KvStopWordProfileStore(backend);
	const wordLists = new KvStopWordWordListStore(backend);
	return new DefaultStopWordStore(profiles, wordLists);
}

function makeTemplate(partial: Partial<ProseTemplate>): ProseTemplate {
	return {
		templateId: "tpl_" + Math.random().toString(36).slice(2, 8),
		targetSchema: "ObservationEvent",
		sectionPattern: ".+",
		priority: 50,
		slots: [],
		...partial,
	};
}

function slotWithTrigger(partial: Partial<ProseSlot>): ProseSlot {
	return {
		slotName: "slot_a",
		slotType: "concept",
		anchorPattern: ".+",
		triggerPattern: "presents with",
		suggestText: "presents with ",
		...partial,
	};
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("ProseTemplateSuggester", () => {
	it("returns empty when no templates have triggerPattern", async () => {
		const store = makeKvTemplateStore();
		const suggester = new ProseTemplateSuggester(store);
		await store.set(
			makeTemplate({
				templateId: "no_trigger",
				slots: [{ slotName: "x", slotType: "concept", anchorPattern: ".+" }],
			}),
		);

		const results = await suggester.suggest("any text", {
			personnelId: "user1",
		});
		expect(results).toHaveLength(0);
	});

	it("matches slot by triggerPattern prefix", async () => {
		const store = makeKvTemplateStore();
		const suggester = new ProseTemplateSuggester(store);
		await store.set(
			makeTemplate({
				templateId: "cardio_hpi",
				priority: 100,
				targetSchema: "ObservationEvent",
				slots: [
					slotWithTrigger({
						slotName: "chief_complaint",
						triggerPattern: "presents with",
						suggestText: "presents with ",
					}),
				],
			}),
		);

		const results = await suggester.suggest("Pt presents with sharp", {
			personnelId: "user1",
		});
		expect(results).toHaveLength(1);
		expect(results[0]!.slotName).toBe("chief_complaint");
		expect(results[0]!.insertText).toBe("presents with ");
		expect(results[0]!.cursorOffset).toBe(14);
		expect(results[0]!.rankScore).toBeGreaterThan(0);
	});

	it("is case-insensitive", async () => {
		const store = makeKvTemplateStore();
		const suggester = new ProseTemplateSuggester(store);
		await store.set(
			makeTemplate({
				templateId: "tpl_ci",
				slots: [
					slotWithTrigger({
						triggerPattern: "PRESENTS WITH ",
						suggestText: "presents with ",
					}),
				],
			}),
		);

		const results = await suggester.suggest("pt presents with pain", {
			personnelId: "user1",
		});
		expect(results).toHaveLength(1);
		expect(results[0]!.insertText).toBe("presents with ");
	});

	it("falls back to triggerPattern when suggestText is absent", async () => {
		const store = makeKvTemplateStore();
		const suggester = new ProseTemplateSuggester(store);
		await store.set(
			makeTemplate({
				templateId: "tpl_fallback",
				slots: [
					slotWithTrigger({
						triggerPattern: "rated as an",
						suggestText: undefined,
					}),
				],
			}),
		);

		const results = await suggester.suggest("pain rated as an 8", {
			personnelId: "user1",
		});
		expect(results).toHaveLength(1);
		expect(results[0]!.insertText).toBe("rated as an");
		expect(results[0]!.cursorOffset).toBe(11);
	});

	it("returns empty for non-matching partial text", async () => {
		const store = makeKvTemplateStore();
		const suggester = new ProseTemplateSuggester(store);
		await store.set(
			makeTemplate({
				templateId: "tpl_nope",
				slots: [slotWithTrigger()],
			}),
		);

		const results = await suggester.suggest("fever", { personnelId: "user1" });
		expect(results).toHaveLength(0);
	});

	it("ranks higher-priority templates first", async () => {
		const store = makeKvTemplateStore();
		const suggester = new ProseTemplateSuggester(store);

		await store.set(
			makeTemplate({
				templateId: "low",
				priority: 10,
				slots: [slotWithTrigger({ triggerPattern: "presents with" })],
			}),
		);
		await store.set(
			makeTemplate({
				templateId: "high",
				priority: 90,
				slots: [
					slotWithTrigger({
						triggerPattern: "presents with",
						suggestText: "presents with ",
					}),
				],
			}),
		);

		const results = await suggester.suggest("presents with", {
			personnelId: "user1",
		});
		expect(results).toHaveLength(2);
		expect(results[0]!.templateId).toBe("high");
		expect(results[1]!.templateId).toBe("low");
	});

	it("picks the latest match when multiple slots in one template match", async () => {
		const store = makeKvTemplateStore();
		const suggester = new ProseTemplateSuggester(store);
		await store.set(
			makeTemplate({
				templateId: "tpl_multi",
				slots: [
					slotWithTrigger({ slotName: "early", triggerPattern: "sharp" }),
					slotWithTrigger({ slotName: "late", triggerPattern: "chest pain" }),
				],
			}),
		);

		const results = await suggester.suggest("sharp chest pain", {
			personnelId: "user1",
		});
		expect(results).toHaveLength(1);
		expect(results[0]!.slotName).toBe("late");
	});

	it("nextHints is empty in Phase 1", async () => {
		const store = makeKvTemplateStore();
		const suggester = new ProseTemplateSuggester(store);
		await store.set(
			makeTemplate({
				templateId: "tpl_hints",
				slots: [
					slotWithTrigger({
						slotName: "chief_complaint",
						suggestText: "presents with ",
					}),
				],
			}),
		);

		const results = await suggester.suggest("presents with sharp", {
			personnelId: "user1",
		});
		expect(results).toHaveLength(1);
		expect(results[0]!.nextHints).toEqual([]);
	});

	it("resolves linked slots as nextHints with relation", async () => {
		const store = makeKvTemplateStore();
		const suggester = new ProseTemplateSuggester(store);
		await store.set(
			makeTemplate({
				templateId: "tpl_linked",
				slots: [
					slotWithTrigger({
						slotName: "chief_complaint",
						triggerPattern: "presents with",
						suggestText: "presents with ",
					}),
					slotWithTrigger({
						slotName: "qualifier_severity",
						slotType: "attribute",
						triggerPattern: "severe",
						linkTo: {
							parentSlot: "chief_complaint",
							relation: "qualifier",
						},
					}),
					slotWithTrigger({
						slotName: "duration_length",
						slotType: "concept",
						triggerPattern: "for",
						linkTo: {
							parentSlot: "chief_complaint",
							relation: "duration",
						},
					}),
				],
			}),
		);

		const results = await suggester.suggest("presents with sharp", {
			personnelId: "user1",
		});
		expect(results).toHaveLength(1);
		const hints = results[0]!.nextHints ?? [];

		const relations = hints.map((h) => h.relation);
		expect(relations).toContain("qualifier");
		expect(relations).toContain("duration");

		const durationHint = hints.find((h) => h.relation === "duration")!;
		const qualifierHint = hints.find((h) => h.relation === "qualifier")!;
		expect(durationHint.rankScore).toBeGreaterThan(qualifierHint.rankScore);
	});

	it("resolves child slots from subTemplate as nextHints", async () => {
		const store = makeKvTemplateStore();
		const suggester = new ProseTemplateSuggester(store);
		await store.set(
			makeTemplate({
				templateId: "tpl_child",
				slots: [
					slotWithTrigger({
						slotName: "chief_complaint",
						triggerPattern: "presents with",
						suggestText: "presents with ",
						subTemplate: {
							textGroup: "details",
							slots: [
								{
									slotName: "child_attr",
									slotType: "attribute",
									anchorPattern: ".+",
									triggerPattern: "severe",
								},
							],
						},
					}),
				],
			}),
		);

		const results = await suggester.suggest("presents with sharp", {
			personnelId: "user1",
		});
		expect(results).toHaveLength(1);
		const hints = results[0]!.nextHints ?? [];
		const childHint = hints.find((h) => h.slotName === "child_attr");
		expect(childHint).toBeDefined();
		expect(childHint!.slotType).toBe("attribute");
		expect(childHint!.triggerPattern).toBe("severe");
	});

	it("resolves unfilled sibling slots as nextHints", async () => {
		const store = makeKvTemplateStore();
		const suggester = new ProseTemplateSuggester(store);
		await store.set(
			makeTemplate({
				templateId: "tpl_siblings",
				slots: [
					slotWithTrigger({ slotName: "slot_a", triggerPattern: "alpha" }),
					slotWithTrigger({
						slotName: "slot_b",
						slotType: "attribute",
						triggerPattern: "beta",
					}),
					slotWithTrigger({ slotName: "slot_c", triggerPattern: "gamma" }),
				],
			}),
		);

		const results = await suggester.suggest("alpha", {
			personnelId: "user1",
		});
		expect(results).toHaveLength(1);
		const hints = results[0]!.nextHints ?? [];
		expect(hints.map((h) => h.slotName).sort()).toEqual([
			"slot_b",
			"slot_c",
		]);
	});

	it("excludes slots from nextHints when conditions.pipeline returns false", async () => {
		const store = makeKvTemplateStore();
		const suggester = new ProseTemplateSuggester(store);
		await store.set(
			makeTemplate({
				templateId: "tpl_cond",
				slots: [
					slotWithTrigger({
						slotName: "chief_complaint",
						triggerPattern: "presents with",
						suggestText: "presents with ",
					}),
					slotWithTrigger({
						slotName: "severe_slot",
						slotType: "attribute",
						triggerPattern: "severe",
						conditions: {
							pipeline: [
								{ op: "eq", args: [{ $var: "pain_level" }, 8] },
							],
						},
					}),
				],
			}),
		);

		const results = await suggester.suggest("presents with sharp", {
			personnelId: "user1",
			filledSlots: { pain_level: 5 },
		});
		expect(results).toHaveLength(1);
		const hints = results[0]!.nextHints ?? [];
		expect(hints.find((h) => h.slotName === "severe_slot")).toBeUndefined();
	});

	it("includes slots when conditions.pipeline returns true", async () => {
		const store = makeKvTemplateStore();
		const suggester = new ProseTemplateSuggester(store);
		await store.set(
			makeTemplate({
				templateId: "tpl_cond_pass",
				slots: [
					slotWithTrigger({
						slotName: "chief_complaint",
						triggerPattern: "presents with",
						suggestText: "presents with ",
					}),
					slotWithTrigger({
						slotName: "severe_slot",
						slotType: "attribute",
						triggerPattern: "severe",
						conditions: {
							pipeline: [
								{ op: "eq", args: [{ $var: "pain_level" }, 8] },
							],
						},
					}),
				],
			}),
		);

		const results = await suggester.suggest("presents with sharp", {
			personnelId: "user1",
			filledSlots: { pain_level: 8 },
		});
		expect(results).toHaveLength(1);
		const hints = results[0]!.nextHints ?? [];
		expect(hints.find((h) => h.slotName === "severe_slot")).toBeDefined();
	});

	it("sorts nextHints by tier and relation priority", async () => {
		const store = makeKvTemplateStore();
		const suggester = new ProseTemplateSuggester(store);
		await store.set(
			makeTemplate({
				templateId: "tpl_rank",
				slots: [
					{
						slotName: "chief_complaint",
						slotType: "concept",
						anchorPattern: ".+",
						triggerPattern: "presents with",
						suggestText: "presents with ",
						subTemplate: {
							textGroup: "details",
							slots: [
								{
									slotName: "child_a",
									slotType: "sub_section",
									anchorPattern: ".+",
									triggerPattern: "child_a",
								},
							],
						},
					},
					{
						slotName: "sibling_a",
						slotType: "concept",
						anchorPattern: ".+",
						triggerPattern: "sibling_a",
					},
					{
						slotName: "supp_link",
						slotType: "concept",
						anchorPattern: ".+",
						triggerPattern: "supporting",
						linkTo: {
							parentSlot: "chief_complaint",
							relation: "supporting",
						},
					},
					{
						slotName: "trig_link",
						slotType: "concept",
						anchorPattern: ".+",
						triggerPattern: "trigger_me",
						linkTo: {
							parentSlot: "chief_complaint",
							relation: "trigger",
						},
					},
				],
			}),
		);

		const results = await suggester.suggest("presents with sharp", {
			personnelId: "user1",
		});
		expect(results).toHaveLength(1);
		const hints = results[0]!.nextHints ?? [];
		const ranked = hints.map((h) => h.slotName);
		expect(ranked).toEqual([
			"trig_link",
			"supp_link",
			"child_a",
			"sibling_a",
		]);
	});

	it("stop-word gate suppresses suggestion when cursor is on a stop word", async () => {
		const store = makeKvTemplateStore();
		const wordStore = makeKvStopWordStore();
		const suggester = new ProseTemplateSuggester(store, wordStore);

		await wordStore.profileStore.set({
			profileId: "p1",
			personnelId: "user1",
			localeFiles: [],
			specialtyFiles: [],
			customWords: [],
			wordListIds: ["id_glob"],
			excludedWords: [],
			additionalWords: [],
		});
		await wordStore.wordListStore.set("id_glob", ["the", "a", "an"]);

		await store.set(
			makeTemplate({
				templateId: "tpl_stop",
				slots: [slotWithTrigger({ triggerPattern: "presents with" })],
			}),
		);

		const results = await suggester.suggest("patient presents with the", {
			personnelId: "user1",
		});
		expect(results).toHaveLength(0);
	});

	it("stop-word gate does not suppress when cursor is on a non-stop word", async () => {
		const store = makeKvTemplateStore();
		const wordStore = makeKvStopWordStore();
		const suggester = new ProseTemplateSuggester(store, wordStore);

		await wordStore.profileStore.set({
			profileId: "p2",
			personnelId: "user2",
			localeFiles: [],
			specialtyFiles: [],
			customWords: [],
			wordListIds: ["id_glob"],
			excludedWords: [],
			additionalWords: [],
		});
		await wordStore.wordListStore.set("id_glob", ["the", "a"]);

		await store.set(
			makeTemplate({
				templateId: "tpl_no_stop",
				slots: [slotWithTrigger({ triggerPattern: "presents with" })],
			}),
		);

		const results = await suggester.suggest("presents with sharp", {
			personnelId: "user2",
		});
		expect(results).toHaveLength(1);
	});
});
