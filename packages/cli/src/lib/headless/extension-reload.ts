import {
	ExtensionRuntime,
	type MacroListenerRegistry,
} from "@stateful-mcp/macro";

export async function reloadHeadlessExtensions(
	directory: string,
	runtime = new ExtensionRuntime({
		rootDirectory: directory,
		logger: {
			debug: () => {},
			info: () => {},
			warn: () => {},
			error: (message) => console.error(message),
		},
	}),
	listeners?: MacroListenerRegistry,
): Promise<{
	runtime: ExtensionRuntime;
	active: string[];
	diagnostics: readonly unknown[];
}> {
	await runtime.dispose();
	await runtime.load(directory);
	const result = await runtime.activate();
	if (listeners) {
		listeners.clear();
		for (const listener of runtime.getListeners())
			listeners.registerParseListener(listener);
	}
	return {
		runtime,
		active: result.active.map((item) => item.manifest.id),
		diagnostics: result.diagnostics,
	};
}
