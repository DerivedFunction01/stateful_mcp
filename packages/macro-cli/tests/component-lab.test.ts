import { describe, expect, test } from "bun:test";
import { parseArgs } from "../src/index";
import { TuiStoryRegistry } from "../src/lab/story-registry";
import { createMockWorkspace } from "../src/lab/mock-workspace";
import { buildDynamicKeymapHints } from "../src/ui/primitives/TuiHelpBar";
import { translate } from "../src/locales";

describe("macro-cli --inspect argument parsing", () => {
	test("parses --inspect flag as gallery mode", () => {
		const opts = parseArgs(["--inspect"]);
		expect(opts.inspect).toBe(true);
		expect(opts.inspectTarget).toBeUndefined();
	});

	test("parses --inspect=gallery as gallery mode", () => {
		const opts = parseArgs(["--inspect=gallery"]);
		expect(opts.inspect).toBe(true);
		expect(opts.inspectTarget).toBeUndefined();
	});

	test("parses --inspect=component=status-bar", () => {
		const opts = parseArgs(["--inspect=component=status-bar"]);
		expect(opts.inspect).toBe(true);
		expect(opts.inspectTarget).toBe("status-bar");
	});

	test("parses --inspect=view=journal and --inspect=tab=scratchpad", () => {
		expect(parseArgs(["--inspect=view=journal"]).inspectTarget).toBe("journal");
		expect(parseArgs(["--inspect=tab=scratchpad"]).inspectTarget).toBe("scratchpad");
	});
});

describe("TuiStoryRegistry", () => {
	test("registers and deterministically orders stories by category", () => {
		const registry = new TuiStoryRegistry();
		registry.register({
			id: "view-1",
			title: "View 1",
			category: "Views",
			states: ["default"],
			render: () => null,
		});
		registry.register({
			id: "core-1",
			title: "Core 1",
			category: "Core",
			states: ["default"],
			render: () => null,
		});
		registry.register({
			id: "modal-1",
			title: "Modal 1",
			category: "Modals",
			states: ["default"],
			render: () => null,
		});

		const list = registry.listStories();
		expect(list.map((s) => s.id)).toEqual(["core-1", "modal-1", "view-1"]);
	});

	test("registers extension contributions and cleans them up on disposal", () => {
		const registry = new TuiStoryRegistry();
		registry.registerContribution({
			id: "retail.pos",
			ownerExtensionId: "retail",
			title: "Retail POS",
			states: ["empty-cart", "active-order"],
			render: () => null,
		});

		expect(registry.getStory("retail.pos")?.title).toBe("Retail POS");
		expect(registry.listStories()).toHaveLength(1);

		registry.removeExtensionContributions("retail");
		expect(registry.getStory("retail.pos")).toBeUndefined();
		expect(registry.listStories()).toHaveLength(0);
	});
});

describe("Mock Workspace & Dynamic Keymaps/i18n", () => {
	test("creates mock workspace with registered commands and i18n support", () => {
		const { workspace, keymap } = createMockWorkspace({ locale: "es" });
		expect(workspace.editor.buffer.getLines()).toHaveLength(3);
		expect(workspace.commands.getCommand("workspace.switchSession")?.title).toBe("Switch session");
		expect(keymap.profileId).toBe("default");
		expect(keymap.window.pinMacro).toBe("ALT_P");

		// Test i18n translation from workspace
		const translatedCommands = translate(workspace.i18n, "palette.title", "Commands");
		expect(translatedCommands).toBe("Paleta de Comandos");
	});

	test("builds dynamic keymap hints from keymap profile", () => {
		const { workspace, keymap } = createMockWorkspace();
		const hints = buildDynamicKeymapHints(keymap, workspace.i18n);
		expect(hints).toEqual([
			{ key: "Ctrl+P", action: "Command Palette" },
			{ key: "Ctrl+B", action: "Sidepanel" },
			{ key: "Alt+P", action: "Pin" },
			{ key: "r", action: "Run" },
			{ key: "q", action: "Quit" },
		]);
	});
});
