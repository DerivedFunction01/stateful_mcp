import { describe, expect, test } from "bun:test";
import { createAssertionMacro } from "../src/composition/assertion";
import { createMacroRuntimeContext } from "../src/contracts/context";
import { ExtensionRuntime } from "../src/extensions/runtime";
import {
	CommandPaletteController,
	CommandRegistry,
	CursorBuffer,
	chordMatches,
	createDefaultI18nKernel,
	createMacroWorkspace,
	DEFAULT_EDITOR_KEYMAP_PROFILE,
	deepMergeConfigs,
	EditorKernel,
	ExtensionEjectionManager,
	extractTokenChipsFromProjections,
	findNextWord,
	findPrevWord,
	findWordRangeAt,
	I18nKernel,
	loadWindowLayoutState,
	mergeEditorKeymap,
	normalizeSelection,
	ScratchpadSession,
	SpecialKeys,
	saveWindowLayoutState,
	TabRegistry,
	ViewRegistry,
	WindowLayoutStateManager,
	WorkspaceJournal,
} from "../src/workspace";

describe("Headless Workspace Kernel — Phase 3F.1", () => {
	describe("WindowLayoutStateManager & Persistence", () => {
		test("initializes default layout state and notifies listeners", () => {
			const manager = new WindowLayoutStateManager();
			let notified = 0;
			manager.subscribe(() => notified++);

			const initial = manager.getSnapshot();
			expect(initial.activeTabId).toBe("scratchpad");
			expect(initial.sidepanelOpen).toBe(true);
			expect(initial.focusedPane).toBe("main");

			manager.setActiveTab("notebook");
			expect(manager.getSnapshot().activeTabId).toBe("notebook");
			expect(notified).toBe(1);

			manager.toggleSidepanel();
			expect(manager.getSnapshot().sidepanelOpen).toBe(false);
			expect(notified).toBe(2);
		});

		test("modal stacking and focus routing", () => {
			const manager = new WindowLayoutStateManager();
			manager.openModal({ id: "help", title: "Help Dialog" });

			expect(manager.getSnapshot().focusedPane).toBe("modal");
			expect(manager.getSnapshot().activeModal?.id).toBe("help");

			const closed = manager.closeModal();
			expect(closed?.id).toBe("help");
			expect(manager.getSnapshot().focusedPane).toBe("main");
			expect(manager.getSnapshot().activeModal).toBeNull();
		});

		test("persists and restores layout snapshot via storage store", async () => {
			const store = new Map<string, string>();
			const mockStorage = {
				getItem: (k: string) => store.get(k) ?? null,
				setItem: (k: string, v: string) => {
					store.set(k, v);
				},
			};

			const manager = new WindowLayoutStateManager();
			manager.setActiveTab("settings");
			manager.setSidepanelWidthRatio(0.45);
			await saveWindowLayoutState(manager, mockStorage);

			const restored = await loadWindowLayoutState(mockStorage);
			expect(restored?.activeTabId).toBe("settings");
			expect(restored?.sidepanelWidthRatio).toBe(0.45);
		});

		test("keeps activity and inspector regions independent with pinning", () => {
			const manager = new WindowLayoutStateManager();
			manager.setActiveActivityContainer("explorer");
			manager.setActiveInspectorContainer("slots");
			manager.setRegionDock("activity", "end");
			manager.setInspectorMode("pinned");
			manager.setPinnedInspectorView("slots.detail");

			const snapshot = manager.getSnapshot();
			expect(snapshot.activeActivityContainerId).toBe("explorer");
			expect(snapshot.activeInspectorContainerId).toBe("slots");
			expect(snapshot.regions.activity.dock).toBe("end");
			expect(snapshot.regions.inspector.dock).toBe("end");
			expect(snapshot.inspectorMode).toBe("pinned");
			expect(snapshot.pinnedInspectorViewId).toBe("slots.detail");
		});
	});

	describe("CursorBuffer & Vim Motions", () => {
		test("text insertion, line splitting, and backspace", () => {
			const buffer = new CursorBuffer("hello world");
			buffer.setCursor(0, 5);
			buffer.insertText(" beautiful");

			expect(buffer.getText()).toBe("hello beautiful world");
			expect(buffer.getCursor()).toEqual({ line: 0, col: 15 });

			buffer.splitLine();
			expect(buffer.getLineCount()).toBe(2);
			expect(buffer.getLine(0)).toBe("hello beautiful");
			expect(buffer.getLine(1)).toBe(" world");
			expect(buffer.getCursor()).toEqual({ line: 1, col: 0 });

			buffer.deleteChar(-1); // backspace joins lines
			expect(buffer.getLineCount()).toBe(1);
			expect(buffer.getText()).toBe("hello beautiful world");
		});

		test("finds word boundaries for motions", () => {
			const line = "   ^evaluacion #asma con #sibilancias  ";
			expect(findNextWord(line, 0)).toBe(3); // start of '^'
			expect(findNextWord(line, 3)).toBe(4); // start of 'evaluacion'
			expect(findNextWord(line, 4)).toBe(15); // start of '#'
			expect(findPrevWord(line, 15)).toBe(4);
			expect(findWordRangeAt("word1 word2", 2)).toEqual({ start: 0, end: 5 });
		});

		test("selection normalization", () => {
			const sel = normalizeSelection({
				start: { line: 2, col: 5 },
				end: { line: 1, col: 2 },
			});
			expect(sel.start).toEqual({ line: 1, col: 2 });
			expect(sel.end).toEqual({ line: 2, col: 5 });
		});
	});

	describe("EditorKernel (Dual-Mode Vim + Mouse)", () => {
		test("Vim modal navigation and verbs", () => {
			const editor = new EditorKernel("line 1\nline 2\nline 3");
			expect(editor.getMode()).toBe("NORMAL");

			// Vim 'j' motion
			editor.handleKey({ char: "j" });
			expect(editor.buffer.getCursor()).toEqual({ line: 1, col: 0 });

			// Vim 'dd' delete line
			editor.handleKey({ char: "d" });
			editor.handleKey({ char: "d" });
			expect(editor.buffer.getLineCount()).toBe(2);
			expect(editor.buffer.getLine(1)).toBe("line 3");
			expect(editor.getYankBuffer()).toBe("line 2");

			// Vim 'i' to insert mode
			editor.handleKey({ char: "i" });
			expect(editor.getMode()).toBe("INSERT");
			editor.handleKey({ char: "A" });
			editor.handleKey({ char: "B" });
			expect(editor.buffer.getLine(1)).toBe("ABline 3");

			// Escape back to NORMAL
			editor.handleKey({ name: "escape" });
			expect(editor.getMode()).toBe("NORMAL");
		});

		test("Modeless Mouse interactions (click, drag, word-select)", () => {
			const editor = new EditorKernel("first second third");
			editor.clickAt(0, 7);
			expect(editor.buffer.getCursor()).toEqual({ line: 0, col: 7 });

			editor.selectWordAt(0, 8);
			expect(editor.getMode()).toBe("VISUAL");
			expect(editor.buffer.getSelection()).toEqual({
				start: { line: 0, col: 6 },
				end: { line: 0, col: 12 },
			});
		});
	});

		describe("Contribution Registries & Command Palette", () => {
		test("ViewRegistry and TabRegistry dynamic contributions", () => {
			const viewReg = new ViewRegistry();
			viewReg.registerContainer(
				{
					id: "customContainer",
					title: "Custom Panel",
					icon: "★",
					altKey: "4",
				},
				"ext1",
			);
			viewReg.registerView(
				{
					id: "customView",
					name: "Custom Inspector",
					containerId: "customContainer",
				},
				{ render: () => "RenderedView" },
				"ext1",
			);

			expect(viewReg.getContainer("customContainer")?.title).toBe(
				"Custom Panel",
			);
			expect(viewReg.getViewsForContainer("customContainer")).toHaveLength(1);
			expect(viewReg.getContainersForRegion("activity").some((container) => container.id === "customContainer")).toBe(true);
			viewReg.registerContainer({ id: "inspectorContainer", title: "Inspector", icon: "◈", region: "inspector" });
			viewReg.registerView({ id: "diagnostics", name: "Diagnostics", containerId: "inspectorContainer", region: "inspector", when: { key: "hasDiagnostics", equals: true }, priority: 10 }, { render: () => "Diagnostics" });
			expect(viewReg.getViewsForRegion("inspector", { activeTabId: "scratchpad", focusedPane: "main", hasDiagnostics: true })).toHaveLength(1);
			expect(viewReg.getViewsForRegion("inspector", { activeTabId: "scratchpad", focusedPane: "main", hasDiagnostics: false })).toHaveLength(0);

			const tabReg = new TabRegistry();
			tabReg.registerTab(
				{ id: "customTab", label: "Custom Graph", order: 50 },
				{ render: () => "RenderedTab" },
				"ext1",
			);
			expect(tabReg.getTab("customTab")?.label).toBe("Custom Graph");
		});

		test("CommandPalette filtering and execution", async () => {
			const cmdReg = new CommandRegistry();
			let executed = false;
			cmdReg.registerCommand(
				{
					command: "macro.executeAll",
					title: "Execute All Cells",
					category: "Macro",
				},
				{
					execute: () => {
						executed = true;
					},
				},
			);

			const palette = new CommandPaletteController(cmdReg);
			palette.open("execute");
			const items = palette.getItems();
			expect(items.length).toBeGreaterThanOrEqual(1);
			expect(items[0]?.title).toBe("Execute All Cells");

			await palette.executeSelected();
			expect(executed).toBe(true);
			expect(palette.getIsOpen()).toBe(false);
		});
	});

	describe("Layered Config Resolver & Ejection", () => {
		test("deep merges shipped defaults with workspace overrides", () => {
			const defaults = {
				syntax: { macroStartToken: "^", expressionToken: "#" },
				precision: 2,
				theme: "dark",
			};
			const overrides = {
				syntax: { macroStartToken: "!" },
				precision: 4,
			};

			const effective = deepMergeConfigs(defaults, overrides);
			expect(effective.syntax.macroStartToken).toBe("!");
			expect(effective.syntax.expressionToken).toBe("#"); // preserved
			expect(effective.precision).toBe(4);
			expect(effective.theme).toBe("dark"); // preserved
		});

		test("ejection manager writes and resets extension config", async () => {
			const written = new Map<string, string>();
			const ejection = new ExtensionEjectionManager({
				extensionId: "clinical-pack",
				defaultTemplate: { units: { mg: "milligram" } },
				schemaUrl: "https://schema.org/test.json",
				writeConfigFile: (id, content) => {
					written.set(id, content);
				},
				deleteConfigFile: (id) => {
					written.delete(id);
				},
			});

			await ejection.ejectConfig();
			expect(written.has("clinical-pack")).toBe(true);
			expect(written.get("clinical-pack")).toContain(
				"https://schema.org/test.json",
			);

			await ejection.resetConfigToDefaults();
			expect(written.has("clinical-pack")).toBe(false);
		});
	});

	describe("i18n Kernel (Cascading Fallback & Parameters)", () => {
		test("translates parameters and falls back gracefully", () => {
			const i18n = new I18nKernel("en");
			i18n.registerTranslations("en", {
				greeting: "Hello, {name}!",
				count: "{count} items found",
			});
			i18n.registerTranslations("es", {
				greeting: "¡Hola, {name}!",
			});

			expect(i18n.t("greeting", { name: "Antigravity" })).toBe(
				"Hello, Antigravity!",
			);

			i18n.setActiveLocale("es");
			expect(i18n.t("greeting", { name: "Antigravity" })).toBe(
				"¡Hola, Antigravity!",
			);
			// Cascades to English for missing Spanish key
			expect(i18n.t("count", { count: 5 })).toBe("5 items found");
		});

		test("default i18n kernel contains built-in shell strings", () => {
			const i18n = createDefaultI18nKernel("es");
			expect(i18n.t("shell.mode.normal")).toBe("NORMAL");
			expect(i18n.t("workspace.tab.scratchpad")).toBe("Borrador");
		});

		test("extension registers locales and unregisters on disposal", async () => {
			const i18n = new I18nKernel("es");
			const runtime = new ExtensionRuntime({ i18n });

			const customExt = {
				manifest: {
					id: "cardio-pack",
					version: "1.0.0",
				},
				activate: (ctx: any) => {
					ctx.i18n?.registerTranslations("es", {
						"cardio.ecg.title": "Electrocardiograma ({lead} derivaciones)",
					});
					return {
						localizations: [
							{
								languageId: "en",
								dictionary: {
									"cardio.ecg.title": "Electrocardiogram ({lead}-lead)",
								},
							},
						],
					};
				},
			};

			await runtime.activate([
				{
					sourceFile: "/ext/cardio-pack/index.ts",
					extension: customExt as any,
				},
			]);

			// Spanish translation active
			expect(i18n.t("cardio.ecg.title", { lead: 12 })).toBe(
				"Electrocardiograma (12 derivaciones)",
			);

			// English fallback when active locale changed
			i18n.setActiveLocale("en");
			expect(i18n.t("cardio.ecg.title", { lead: 12 })).toBe(
				"Electrocardiogram (12-lead)",
			);

			// Dispose extension
			await runtime.dispose("cardio-pack");

			// Translation unregister cleans up cleanly
			expect(i18n.t("cardio.ecg.title")).toBe("cardio.ecg.title");
		});

		test("restores a previous translation when an owner is disposed", () => {
			const i18n = new I18nKernel("en");
			i18n.registerTranslations("en", { greeting: "Built-in" });
			i18n.registerTranslations("en", { greeting: "Extension" }, "ext");
			expect(i18n.t("greeting")).toBe("Extension");
			i18n.unregisterOwner("ext");
			expect(i18n.t("greeting")).toBe("Built-in");
		});
	});

	describe("Token Chips & Slot Projections", () => {
		test("extracts interactive token chips with canonical MacroSlotStatus", () => {
			const projections = [
				{
					macroId: "evaluacion",
					macroVersion: 1,
					argumentId: "dx",
					start: 12,
					end: 17,
					rawText: "#asma",
					displayText: "Asma",
					status: "bound" as const,
					diagnostics: [],
				},
				{
					macroId: "evaluacion",
					macroVersion: 1,
					argumentId: "hallazgos",
					start: 22,
					end: 35,
					rawText: "#sibilancias",
					displayText: "Sibilancias",
					status: "invalid" as const,
					diagnostics: ["Unknown concept code"],
				},
			];

			const chips = extractTokenChipsFromProjections(projections, {
				dx: "subject",
				hallazgos: "supporting",
			});

			expect(chips).toHaveLength(2);
			expect(chips[0]?.slotId).toBe("dx");
			expect(chips[0]?.status).toBe("bound");
			expect(chips[0]?.role).toBe("subject");
			expect(chips[1]?.status).toBe("invalid");
			expect(chips[1]?.diagnostics).toEqual(["Unknown concept code"]);
		});
	});

	describe("ScratchpadSession (Multi-line Live Parsing & Execution)", () => {
		test("parses multi-line macro statements in real-time and produces projected lines", async () => {
			const runtime = new ExtensionRuntime({
				context: createMacroRuntimeContext({ macroStartToken: "^" }),
			});

			// Define a sample assertion macro
			const sampleExt = {
				manifest: {
					id: "test-pack",
					name: "Test Pack",
					version: "1.0.0",
					contributes: {},
				},
				activate: (ctx: any) => ({
					adapters: [
						createAssertionMacro(
							{
								macroName: "evaluacion",
								subjectSlotId: "dx",
								clauses: [
									{
										role: "supporting",
										slotId: "hallazgos",
										valueKind: "concept",
										connectors: ["con"],
									},
								],
							},
							(graph) => ({
								dx: (graph.subject as { term: string }).term,
								hallazgos: graph.evidence.map(
									(e) => (e.value as { term: string }).term,
								),
							}),
							{
								syntax: { expressionToken: "#" },
							},
						),
					],
				}),
			};

			await runtime.activate([
				{
					sourceFile: "/ext/test-pack/index.ts",
					extension: sampleExt as any,
				},
			]);

			const buffer = new CursorBuffer(
				"^evaluacion #asma con #sibilancias\nplain text line\n^evaluacion #bronquitis",
			);
			const session = new ScratchpadSession(runtime, buffer, 10);
			const projected = await session.parseAllLines();

			expect(projected).toHaveLength(3);
			expect(projected[0]?.isValid).toBe(true);
			expect(projected[0]?.macroName).toBe("evaluacion");
			expect(projected[0]?.chips).toHaveLength(2); // dx & hallazgos
			expect(projected[1]?.isValid).toBe(false); // plain text
			expect(projected[2]?.isValid).toBe(true); // second macro line

			expect(session.getValidLineCount()).toBe(2);

			// Execute first line
			const receipt = await session.executeLine(0);
			expect(receipt).not.toBeNull();
			expect(receipt?.macroName).toBe("evaluacion");
			expect((receipt?.result as any)!.dx).toBe("asma");
			expect((receipt?.result as any)!.hallazgos).toEqual(["sibilancias"]);

			// Batch execute all valid lines
			const allReceipts = await session.executeAllValidLines();
			expect(allReceipts).toHaveLength(2);
			expect((allReceipts[1]?.result as any)!.dx).toBe("bronquitis");

			// Pinned Macro Mode test
			const pinnedBuffer = new CursorBuffer("#asma con #sibilancias");
			const pinnedSession = new ScratchpadSession(runtime, pinnedBuffer, 10);
			expect(pinnedSession.getPinnedMacro()).toBeNull();

			// Initially invalid without prefix
			let pinnedProjected = await pinnedSession.parseAllLines();
			expect(pinnedProjected[0]?.isValid).toBe(false);

			// Pin to evaluacion macro
			pinnedSession.setPinnedMacro("evaluacion");
			expect(pinnedSession.getPinnedMacro()).toBe("evaluacion");

			pinnedProjected = await pinnedSession.parseAllLines();
			expect(pinnedProjected[0]?.isValid).toBe(false);
		pinnedBuffer.setCursor(0, pinnedBuffer.getLine(0).length);
		const inserted = pinnedSession.createPinnedMacroLine();
			expect(inserted?.insertedText).toBe("^evaluacion ");
			expect(pinnedBuffer.getLine(1)).toBe("^evaluacion ");
			expect(pinnedBuffer.getCursor()).toEqual({ line: 1, col: "^evaluacion ".length });
		pinnedProjected = await pinnedSession.parseAllLines();
		expect(pinnedProjected[1]?.macroName).toBe("evaluacion");
		});
	});

	describe("WorkspaceJournal (Reversals & Audit Trail)", () => {
		test("records execution receipts and tracks reversals", async () => {
			const map = new Map<string, any>();
			const mockStore = {
				list: async () => Array.from(map.values()),
				set: async (id: string, entry: any) => {
					map.set(id, entry);
				},
				clear: async () => {
					map.clear();
				},
			};

			const journal = new WorkspaceJournal({ store: mockStore });
			await journal.ready();

			let notified = 0;
			journal.subscribe(() => notified++);

			const receipt = {
				lineNumber: 1,
				rawText: "^evaluacion #asma",
				macroName: "evaluacion",
				success: true,
				result: { dx: "asma" },
				executedAt: Date.now(),
			};

			const entry = await journal.recordExecution(receipt);
			expect(entry.status).toBe("committed");
			expect(entry.fingerprint).toMatch(/^[0-9a-f]{64}$/);
			expect(journal.getEntries()).toHaveLength(1);
			expect(journal.getCommittedEntries()).toHaveLength(1);
			expect(notified).toBe(1);

			// Reverse entry
			const reversed = await journal.reverseEntry(
				entry.id,
				"Incorrect diagnostic",
			);
			expect(reversed?.status).toBe("reversed");
			expect(reversed?.reversalReason).toBe("Incorrect diagnostic");
			expect(await journal.reverseEntry(entry.id, "Repeated request")).toEqual(
				reversed,
		);
			expect(journal.getCommittedEntries()).toHaveLength(0);
			expect(journal.getEntries()).toHaveLength(1); // Audit record retained
		});
	});

	describe("Declarative Keymap Profiles & Matching", () => {
		test("provides standard default keymap profile data", () => {
			expect(DEFAULT_EDITOR_KEYMAP_PROFILE.profileId).toBe("default");
			expect(DEFAULT_EDITOR_KEYMAP_PROFILE.normal.moveDown).toBe("j");
			expect(DEFAULT_EDITOR_KEYMAP_PROFILE.normal.enterInsert).toBe("i");
			expect(DEFAULT_EDITOR_KEYMAP_PROFILE.sequences.deleteCell).toBe("dd");
			expect(DEFAULT_EDITOR_KEYMAP_PROFILE.window.openCommandPalette).toBe(
				"CTRL_P",
			);
		});

		test("matches character inputs and special chords accurately", () => {
			// Plain character
			expect(chordMatches("j", { char: "j" })).toBe(true);
			expect(chordMatches("j", { char: "j", ctrl: true })).toBe(false);

			// Ctrl+R redo chord
			expect(chordMatches(SpecialKeys.CtrlR, { char: "r", ctrl: true })).toBe(
				true,
			);
			expect(chordMatches(SpecialKeys.CtrlR, { char: "r", ctrl: false })).toBe(
				false,
			);

			// Special keys (Enter, Esc, Tab, Shift-Tab)
			expect(chordMatches(SpecialKeys.Enter, { name: "return" })).toBe(true);
			expect(chordMatches(SpecialKeys.Escape, { name: "escape" })).toBe(true);
			expect(chordMatches("SHIFT_TAB", { name: "tab", shift: true })).toBe(
				true,
			);
			expect(chordMatches(SpecialKeys.Tab, { name: "tab", shift: false })).toBe(
				true,
			);
		});

		test("merges keymap overrides without mutating defaults", () => {
			const custom = mergeEditorKeymap(DEFAULT_EDITOR_KEYMAP_PROFILE, {
				profileId: "custom-emacs",
				normal: {
					...DEFAULT_EDITOR_KEYMAP_PROFILE.normal,
					moveDown: "n",
					moveUp: "p",
				},
			});

			expect(custom.profileId).toBe("custom-emacs");
			expect(custom.normal.moveDown).toBe("n");
			expect(custom.normal.moveUp).toBe("p");
			expect(custom.normal.enterInsert).toBe("i"); // preserved from default
			expect(DEFAULT_EDITOR_KEYMAP_PROFILE.normal.moveDown).toBe("j"); // pristine
		});
	});

	describe("createMacroWorkspace Full Factory", () => {
		test("instantiates complete observable workspace with scratchpad session", () => {
			const ws = createMacroWorkspace({
				initialText: "^note #test",
				initialLocale: "en",
			});
			expect(ws.editor.buffer.getText()).toBe("^note #test");
			expect(ws.layout.getSnapshot().activeTabId).toBe("scratchpad");
			expect(ws.tabs.getTabs()).toHaveLength(3);
			expect(ws.views.getContainers()).toHaveLength(3);
			expect(ws.i18n.t("shell.mode.normal")).toBe("NORMAL");
			expect(ws.journal.getEntries()).toHaveLength(0);
			expect(ws.scratchpad).toBeDefined();
			expect(ws.runtime).toBeDefined();
			expect(ws.scratchpad.getTotalLineCount()).toBe(1);
		});

		test("strict macro verb matching prevents false substring matches", async () => {
			const runtime = new ExtensionRuntime({
				context: createMacroRuntimeContext({ macroStartToken: "^" }),
			});
			const bookExt = {
				manifest: { id: "book-pack", version: "1.0.0" },
				activate: () => ({
					adapters: [
						createAssertionMacro(
							{
								macroName: "book",
								subjectSlotId: "title",
								clauses: [],
							},
							(graph) => ({ title: (graph.subject as any).term }),
						),
					],
				}),
			};

			await runtime.activate([
				{ sourceFile: "/ext/book/index.ts", extension: bookExt as any },
			]);

			const buffer = new CursorBuffer(
				"^book #harry_potter\nthis is my notebook\n#bookkeeping notes",
			);
			const session = new ScratchpadSession(runtime, buffer, 10);
			const projected = await session.parseAllLines();

			// Line 1: ^book #harry_potter -> VALID
			expect(projected[0]?.isValid).toBe(true);
			expect(projected[0]?.macroName).toBe("book");

			// Line 2: notebook -> INVALID (does NOT match 'book')
			expect(projected[1]?.isValid).toBe(false);

			// Line 3: #bookkeeping -> INVALID (does NOT match 'book')
			expect(projected[2]?.isValid).toBe(false);
		});
	});
});
