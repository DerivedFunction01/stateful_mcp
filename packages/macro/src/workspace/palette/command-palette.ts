import type { CommandRegistry } from "../contributions/command-registry";
import type { TabRegistry } from "../contributions/tab-registry";
import { resolveKeymapBindings } from "../keymaps/matcher";
import type { EditorKeymapProfile } from "../keymaps/types";
import type { WindowLayoutStateManager } from "../layout/window-layout-state";

export interface PaletteItem {
	readonly id: string;
	readonly title: string;
	readonly category?: string;
	readonly keybinding?: string | readonly string[];
	readonly execute: () => Promise<void> | void;
}

export class CommandPaletteController {
	private query = "";
	private selectedIndex = 0;
	private isOpen = false;
	private readonly listeners = new Set<() => void>();

	constructor(
		private readonly commandRegistry: CommandRegistry,
		private readonly layoutManager?: WindowLayoutStateManager,
		private readonly tabRegistry?: TabRegistry,
		private readonly getKeymap?: () => EditorKeymapProfile | undefined,
	) {}

	getIsOpen(): boolean {
		return this.isOpen;
	}

	open(initialQuery = ""): void {
		this.isOpen = true;
		this.query = initialQuery;
		this.selectedIndex = 0;
		if (this.layoutManager) {
			this.layoutManager.setFocusedPane("palette");
		}
		this.notify();
	}

	close(): void {
		this.isOpen = false;
		this.query = "";
		this.selectedIndex = 0;
		if (this.layoutManager) {
			this.layoutManager.setFocusedPane("main");
		}
		this.notify();
	}

	getQuery(): string {
		return this.query;
	}

	setQuery(query: string): void {
		this.query = query;
		this.selectedIndex = 0;
		this.notify();
	}

	getSelectedIndex(): number {
		return this.selectedIndex;
	}

	setSelectedIndex(index: number): void {
		const items = this.getItems();
		if (items.length === 0) {
			this.selectedIndex = 0;
		} else {
			this.selectedIndex = Math.max(0, Math.min(items.length - 1, index));
		}
		this.notify();
	}

	moveSelection(delta: 1 | -1): void {
		const items = this.getItems();
		if (items.length === 0) return;
		this.selectedIndex =
			(this.selectedIndex + delta + items.length) % items.length;
		this.notify();
	}

	getItems(): readonly PaletteItem[] {
		const allItems: PaletteItem[] = [];

		const profile = this.getKeymap?.();
		const aliases = profile?.aliases;

		// 1. Extension and registered commands
		for (const cmd of this.commandRegistry.getCommands()) {
			const cmdAliases: string[] = [];
			if (aliases) {
				const entry = aliases[cmd.command];
				if (Array.isArray(entry)) {
					cmdAliases.push(...entry);
				} else if (typeof entry === "string") {
					cmdAliases.push(entry);
				}
			}
			const aliasHint =
				cmdAliases.length > 0 ? `:${cmdAliases.join(", :")}` : undefined;
			allItems.push({
				id: cmd.command,
				title: cmd.titleI18nKey ?? cmd.command,
				category: cmd.categoryI18nKey ?? "common.workspace",
				keybinding: cmd.keybinding ?? aliasHint,
				execute: () => this.commandRegistry.executeCommand(cmd.command),
			});
		}

		// 2. Built-in Windowing & Layout commands
		if (this.layoutManager) {
			const profile = this.getKeymap?.();
			const bindings = profile ? resolveKeymapBindings(profile) : [];
			const getShortcut = (cmd: string) =>
				bindings.find((b) => b.command === cmd)?.chords[0];
			const sidepanelChord = getShortcut("workbench.toggleSidepanel");
			const nextTabChord = getShortcut("editor.nextTab");
			const prevTabChord = getShortcut("editor.prevTab");

			allItems.push({
				id: "workbench.toggleSidepanel",
				title: "menu.toggleSidepanel",
				category: "menu.view",
				...(sidepanelChord ? { keybinding: sidepanelChord } : {}),
				execute: () => this.layoutManager?.toggleSidepanel(),
			});
			allItems.push({
				id: "editor.nextTab",
				title: "editor.nextTab",
				category: "menu.view",
				...(nextTabChord ? { keybinding: nextTabChord } : {}),
				execute: () => this.layoutManager?.nextTab(1),
			});
			allItems.push({
				id: "editor.prevTab",
				title: "editor.prevTab",
				category: "menu.view",
				...(prevTabChord ? { keybinding: prevTabChord } : {}),
				execute: () => this.layoutManager?.nextTab(-1),
			});
		}

		// 3. Tab Direct Switchers
		if (this.tabRegistry && this.layoutManager) {
			for (const tab of this.tabRegistry.getTabs()) {
				allItems.push({
					id: `tab.switch.${tab.id}`,
					title: tab.label,
					category: "common.navigation",
					execute: () => this.layoutManager?.setActiveTab(tab.id),
				});
			}
		}

		// Filter by query (case-insensitive fuzzy substring match)
		const q = this.query.trim().toLowerCase();
		if (!q) return allItems;

		return allItems.filter((item) => {
			const command = this.commandRegistry.getCommand(item.id);
			const text =
				`${item.category ?? ""} ${item.title} ${item.id} ${item.keybinding ?? ""} ${command?.aliases?.join(" ") ?? ""}`.toLowerCase();
			return text.includes(q);
		});
	}

	async executeSelected(): Promise<void> {
		const items = this.getItems();
		const item = items[this.selectedIndex];
		this.close();
		if (item) {
			await item.execute();
		}
	}

	subscribe(listener: () => void): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	private notify(): void {
		for (const listener of this.listeners) {
			try {
				listener();
			} catch (e) {
				console.error("Error in CommandPaletteController listener:", e);
			}
		}
	}
}
