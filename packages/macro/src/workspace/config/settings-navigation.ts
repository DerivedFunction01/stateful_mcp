export type SettingsSection =
	| "all"
	| "appearance"
	| "keymap"
	| "formatting"
	| "workspace"
	| "raw"
	| string;

export interface OpenSettingsRequest {
	readonly section?: SettingsSection;
	readonly focusPath?: readonly string[];
	readonly targetFile?: "profile" | "keymap" | "workspace" | "manifest";
}

export class SettingsNavigationState {
	private request: OpenSettingsRequest = { section: "all" };
	private readonly listeners = new Set<() => void>();
	getSnapshot(): OpenSettingsRequest {
		return this.request;
	}
	open(request: OpenSettingsRequest = {}): void {
		this.request = {
			...this.request,
			...request,
			section: request.section ?? this.request.section ?? "all",
		};
		this.notify();
	}
	reset(): void {
		this.request = { section: "all" };
		this.notify();
	}
	subscribe(listener: () => void): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}
	private notify(): void {
		for (const listener of this.listeners) listener();
	}
}
