/**
 * Ejection and reset manager for folder-isolated extension configurations.
 */

export interface ExtensionEjectionOptions {
	readonly extensionId: string;
	readonly defaultTemplate: Record<string, unknown>;
	readonly schemaUrl?: string;
	readonly writeConfigFile: (
		extensionId: string,
		content: string,
	) => Promise<void> | void;
	readonly deleteConfigFile: (extensionId: string) => Promise<void> | void;
}

export class ExtensionEjectionManager {
	constructor(private readonly options: ExtensionEjectionOptions) {}

	async ejectConfig(): Promise<void> {
		const payload: Record<string, unknown> = {
			...(this.options.schemaUrl ? { $schema: this.options.schemaUrl } : {}),
			...this.options.defaultTemplate,
		};
		const formatted = JSON.stringify(payload, null, 2);
		await this.options.writeConfigFile(this.options.extensionId, formatted);
	}

	async resetConfigToDefaults(): Promise<void> {
		await this.options.deleteConfigFile(this.options.extensionId);
	}
}
