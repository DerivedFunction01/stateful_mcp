import type { ActiveExtension } from "../../extensions/contracts";
import type { CommandRegistry } from "./command-registry";
import type { TabRegistry } from "./tab-registry";
import type { ViewRegistry } from "./view-registry";

export class ExtensionContributionManager {
	private readonly owned = new Map<string, OwnedContributions>();

	constructor(
		private readonly views: ViewRegistry,
		private readonly tabs: TabRegistry,
		private readonly commands: CommandRegistry,
	) {}

	install(active: readonly ActiveExtension[]): void {
		for (const extension of active) this.installOne(extension);
	}

	installOne(extension: ActiveExtension): void {
		this.disposeOwner(extension.manifest.id);
		const manifest = extension.manifest.contributes;
		const activation = extension.contributions;
		const owned: OwnedContributions = {
			containers: [],
			views: [],
			tabs: [],
			commands: [],
		};
		try {
			for (const container of manifest?.viewsContainers?.activitybar ?? []) {
				this.views.registerContainer(container, extension.manifest.id);
				owned.containers.push(container.id);
			}
			for (const [containerId, entries] of Object.entries(
				manifest?.views ?? {},
			)) {
				if (!this.views.getContainer(containerId)) {
					throw new Error(
						`View contribution '${containerId}' references an unknown container`,
					);
				}
				for (const view of entries) {
					if (this.views.getView(view.id))
						throw new Error(`Duplicate view contribution '${view.id}'`);
					const provider = activation?.views?.[view.id];
					if (!provider)
						throw new Error(`View '${view.id}' has no activation provider`);
					this.views.registerView(view, provider, extension.manifest.id);
					owned.views.push(view.id);
				}
			}
			for (const tab of manifest?.workspaceTabs ?? []) {
				if (this.tabs.getTab(tab.id))
					throw new Error(`Duplicate tab contribution '${tab.id}'`);
				const provider = activation?.tabs?.[tab.id];
				if (!provider)
					throw new Error(`Tab '${tab.id}' has no activation provider`);
				this.tabs.registerTab(tab, provider, extension.manifest.id);
				owned.tabs.push(tab.id);
			}
			for (const command of manifest?.commands ?? []) {
				if (this.commands.getCommand(command.command)) {
					throw new Error(
						`Duplicate command contribution '${command.command}'`,
					);
				}
				const handler = activation?.commands?.[command.command];
				if (!handler)
					throw new Error(
						`Command '${command.command}' has no activation handler`,
					);
				this.commands.registerCommand(command, handler, extension.manifest.id);
				owned.commands.push(command.command);
			}
			this.owned.set(extension.manifest.id, owned);
		} catch (error) {
			this.removeOwned(owned);
			throw error;
		}
	}

	disposeOwner(extensionId: string): void {
		const owned = this.owned.get(extensionId);
		if (!owned) return;
		this.removeOwned(owned);
		this.owned.delete(extensionId);
	}

	dispose(): void {
		for (const extensionId of [...this.owned.keys()].reverse()) {
			this.disposeOwner(extensionId);
		}
	}

	private removeOwned(owned: OwnedContributions): void {
		for (const id of owned.commands) this.commands.unregisterCommand(id);
		for (const id of owned.tabs) this.tabs.unregisterTab(id);
		for (const id of owned.views) this.views.unregisterView(id);
		for (const id of owned.containers) this.views.unregisterContainer(id);
	}
}

interface OwnedContributions {
	containers: string[];
	views: string[];
	tabs: string[];
	commands: string[];
}
