import { describe, expect, test } from "bun:test";
import { GlobalThemeRegistry, parseArgs } from "../src/index";
import { createMockWorkspace } from "../src/lab/mock-workspace";
import { TuiStoryRegistry } from "../src/lab/story-registry";
import { translate } from "../src/locales";
import { resolveTuiWorkspaceLayout } from "../src/ui/compositions/layout";
import {
	buildContextualHelpBarHints,
	buildDynamicKeymapHints,
} from "../src/ui/primitives/TuiHelpBar";
import { GITHUB_DARK_THEME, generateCssThemeVariables } from "../src/ui/theme";

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
		expect(parseArgs(["--inspect=tab=scratchpad"]).inspectTarget).toBe(
			"scratchpad",
		);
	});

	test("parses positional inspect subcommands", () => {
		expect(parseArgs(["inspect"]).inspect).toBe(true);
		expect(parseArgs(["inspect"]).inspectTarget).toBeUndefined();
		expect(parseArgs(["inspect", "gallery"]).inspectTarget).toBeUndefined();
		expect(
			parseArgs(["inspect", "component", "command-palette"]).inspectTarget,
		).toBe("command-palette");
		expect(parseArgs(["inspect", "view", "journal"]).inspectTarget).toBe(
			"journal",
		);
		expect(parseArgs(["inspect", "tab", "pos"]).inspectTarget).toBe("pos");
		expect(parseArgs(["inspect", "scratchpad"]).inspectTarget).toBe(
			"scratchpad",
		);
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
		expect(
			workspace.commands.getCommand("workspace.switchSession")?.title,
		).toBe("Switch session");
		expect(keymap.profileId).toBe("default");
		expect(keymap.window.pinMacro).toBe("meta+p");

		// Test i18n translation from workspace
		const translatedCommands = translate(workspace.i18n, "palette.title");
		expect(translatedCommands).toBe("Paleta de Comandos");
	});

	test("builds dynamic keymap hints from keymap profile by mode", () => {
		const { workspace, keymap } = createMockWorkspace();

		// INSERT mode hints
		const insertHints = buildDynamicKeymapHints(
			keymap,
			workspace.i18n,
			"INSERT",
		);
		expect(insertHints).toEqual([
			{ key: "Tab", action: "New Line", row: 1 },
			{ key: "Enter", action: "Execute", row: 1 },
			{ key: "k/j", action: "Navigate", row: 1 },
			{ key: "Esc", action: "Normal Mode", row: 1 },
		]);

		// VISUAL mode hints
		const visualHints = buildDynamicKeymapHints(
			keymap,
			workspace.i18n,
			"VISUAL",
		);
		expect(visualHints).toEqual([
			{ key: "k/j", action: "Select Range", row: 1 },
			{ key: "Enter", action: "Execute Selected", row: 1 },
			{ key: "d", action: "Delete", row: 1 },
			{ key: "Esc", action: "Normal Mode", row: 1 },
		]);

		// NORMAL mode hints
		const normalHints = buildDynamicKeymapHints(
			keymap,
			workspace.i18n,
			"NORMAL",
		);
		expect(normalHints).toEqual([
			{ key: "Tab", action: "Next Tab", row: 1 },
			{ key: "i", action: "Insert", row: 1 },
			{ key: "v", action: "Visual", row: 1 },
			{ key: "dd", action: "Delete", row: 1 },
			{ key: "Ctrl+P", action: "Command Palette", row: 2 },
			{ key: "Ctrl+E", action: "Activity", row: 2 },
			{ key: "Ctrl+B", action: "Inspector", row: 2 },
			{ key: "Ctrl+W", action: "Focus Pane", row: 2 },
			{ key: "Alt+P", action: "Pin", row: 2 },
		]);
	});

	test("resolves contextual hints dynamically based on focused pane", () => {
		const { workspace, keymap } = createMockWorkspace();

		// 1. When main editor is focused, returns keymap hints
		workspace.layout.setFocusedPane("main");
		const mainHints = buildContextualHelpBarHints(workspace as any, keymap);
		expect(mainHints.length).toBeGreaterThan(0);
		expect(mainHints[0]).toEqual({ key: "Tab", action: "Next Tab", row: 1 });

		// 2. When activity pane is focused, returns container-level or provider contextual hints
		workspace.layout.setFocusedPane("activity");
		const activityHints = buildContextualHelpBarHints(workspace as any, keymap);
		expect(activityHints).toEqual([
			{ key: "↑/↓", action: "Navigate", row: 1 },
			{ key: "Enter", action: "Open", row: 1 },
			{ key: "Ctrl+W", action: "Focus Pane", row: 1 },
			{ key: "Esc", action: "Editor", row: 1 },
		]);

		// 3. When sidepanel (inspector) is focused, returns inspector contextual hints
		workspace.layout.setFocusedPane("sidepanel");
		const inspectorHints = buildContextualHelpBarHints(
			workspace as any,
			keymap,
		);
		expect(inspectorHints).toEqual([
			{ key: "↑/↓", action: "Navigate", row: 1 },
			{ key: "Enter", action: "Execute", row: 1 },
			{ key: "Alt+2", action: "Close", row: 1 },
			{ key: "Ctrl+W", action: "Focus Pane", row: 1 },
			{ key: "Esc", action: "Editor", row: 1 },
		]);

		// 4. When palette is focused, returns palette navigation and execution hints
		workspace.layout.setFocusedPane("palette");
		const paletteHints = buildContextualHelpBarHints(workspace as any, keymap);
		expect(paletteHints).toEqual([
			{ key: "k/j", action: "Navigate", row: 1 },
			{ key: "Enter", action: "Execute", row: 1 },
			{ key: "Esc", action: "Close", row: 1 },
		]);
	});
});

describe("Theme System & CSS Generation", () => {
	test("provides light, dark, opencode, monokai, and nord themes", () => {
		const themes = GlobalThemeRegistry.list();
		expect(themes.map((t) => t.id)).toContain("github-dark");
		expect(themes.map((t) => t.id)).toContain("github-light");
		expect(themes.map((t) => t.id)).toContain("dark");
		expect(themes.map((t) => t.id)).toContain("monokai");
		expect(themes.map((t) => t.id)).toContain("nord");
	});

	test("switches active theme and retrieves colors", () => {
		expect(GlobalThemeRegistry.setActive("github-light")).toBe(true);
		const light = GlobalThemeRegistry.getActive();
		expect(light.mode).toBe("light");
		expect(light.colors.bgCanvas).toBe("#ffffff");
		expect(light.colors.fgPrimary).toBe("#1f2328");

		GlobalThemeRegistry.setActive("github-dark");
		const dark = GlobalThemeRegistry.getActive();
		expect(dark.mode).toBe("dark");
		expect(dark.colors.bgCanvas).toBe("#0d1117");
	});

	test("generates browser CSS variables from theme definition", () => {
		const css = generateCssThemeVariables(GITHUB_DARK_THEME);
		expect(css).toContain('--theme-id: "github-dark"');
		expect(css).toContain("--color-bg-canvas: #0d1117");
		expect(css).toContain("--color-fg-primary: #f0f6fc");
		expect(css).toContain("--color-accent-primary: #38bdf8");
	});
});

describe("Shared workspace composition layout", () => {
	test("clamps panels in medium terminals and preserves a usable body", () => {
		const layout = resolveTuiWorkspaceLayout({
			width: 120,
			activityWidth: 48,
			inspectorWidth: 44,
		});

		expect(layout.mode).toBe("medium");
		expect(layout.activityWidth).toBe(32);
		expect(layout.inspectorWidth).toBe(32);
		expect(layout.bodyWidth).toBe(54);
		expect(layout.compactRails).toBe(false);
	});

	test("uses compact rails in narrow terminals and supports closed regions", () => {
		const layout = resolveTuiWorkspaceLayout({
			width: 80,
			activityOpen: false,
			inspectorOpen: true,
		});

		expect(layout.mode).toBe("narrow");
		expect(layout.activityWidth).toBe(0);
		expect(layout.inspectorWidth).toBe(5);
		expect(layout.bodyWidth).toBe(74);
		expect(layout.compactRails).toBe(true);
	});

	test("keeps wide terminal panel widths at or above shared minimums", () => {
		const layout = resolveTuiWorkspaceLayout({
			width: 160,
			activityWidth: 30,
			inspectorWidth: 36,
			outerPadding: 2,
		});

		expect(layout.mode).toBe("wide");
		expect(layout.activityWidth).toBe(30);
		expect(layout.inspectorWidth).toBe(36);
		expect(layout.bodyWidth).toBe(88);
	});
});
