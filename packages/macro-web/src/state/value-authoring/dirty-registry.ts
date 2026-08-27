type Listener = () => void;

const listeners = new Set<Listener>();
let dirty = false;

/**
 * Bridges wizard-local dirty state into app-level unsaved-changes navigation
 * guards without coupling the wizard to the app shell. The value-authoring
 * route publishes; App subscribes.
 */
export const valueStudioDirtyRegistry = {
	get(): boolean {
		return dirty;
	},
	set(next: boolean): void {
		if (next === dirty) return;
		dirty = next;
		for (const listener of [...listeners]) listener();
	},
	subscribe(listener: Listener): () => void {
		listeners.add(listener);
		return () => {
			listeners.delete(listener);
		};
	},
};
