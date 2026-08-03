import type { CommandMacroPreview, ParserCommandMacroStore } from "@stateful-mcp/clinical";
import { createCommandMacroPreviewController } from "@stateful-mcp/clinical";
import { useEffect, useRef, useState } from "react";

export function useCommandMacroPreview({
	mode,
	input,
	store,
	context,
	delayMs = 150,
}: {
	mode: string;
	input: string;
	store?: ParserCommandMacroStore;
	context?: { personnelId?: string; profileId?: string };
	delayMs?: number;
}): { loading: boolean; preview: CommandMacroPreview | null } {
	const controllerRef = useRef<ReturnType<typeof createCommandMacroPreviewController> | null>(null);
	const [preview, setPreview] = useState<CommandMacroPreview | null>(null);
	const [loading, setLoading] = useState(false);
	useEffect(() => {
		controllerRef.current?.cancel();
		if (mode !== "MACRO" || !store || !input.trim()) {
			setLoading(false);
			setPreview(null);
			return;
		}
		const controller = createCommandMacroPreviewController(store, delayMs);
		controllerRef.current = controller;
		setLoading(true);
		void controller.request(input, context).then((result) => {
			if (controllerRef.current !== controller) return;
			setPreview(result);
			setLoading(false);
		});
		return () => controller.cancel();
	}, [mode, input, store, context, delayMs]);
	return { loading, preview };
}
