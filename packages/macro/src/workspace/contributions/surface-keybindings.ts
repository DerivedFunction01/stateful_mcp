import type { EditorMode } from "../editor/editor-kernel";
import type { SurfaceKeybinding } from "./types";

export interface SurfaceKeybindingDiagnostic {
	readonly severity: "error";
	readonly messageKey: string;
	readonly messageParams?: Readonly<Record<string, string | number | boolean>>;
	readonly key?: string;
	readonly mode?: EditorMode;
}

export function validateSurfaceKeybindings(
	keybindings: readonly SurfaceKeybinding[] | undefined,
): readonly SurfaceKeybindingDiagnostic[] {
	if (!keybindings) return [];
	const diagnostics: SurfaceKeybindingDiagnostic[] = [];
	const seen = new Set<string>();
	for (const binding of keybindings) {
		if (
			!binding.key.trim() ||
			!binding.action.trim() ||
			!binding.label.trim()
		) {
			diagnostics.push({
				severity: "error",
				messageKey: "keymap.diagnostic.surface.requiredFields",
				key: binding.key,
				mode: binding.mode,
			});
			continue;
		}
		const identity = `${binding.mode}:${binding.key}`;
		if (seen.has(identity))
			diagnostics.push({
				severity: "error",
				messageKey: "keymap.diagnostic.surface.duplicate",
				messageParams: { key: binding.key, mode: binding.mode },
				key: binding.key,
				mode: binding.mode,
			});
		seen.add(identity);
	}
	return diagnostics;
}

export function surfaceKeybindingsForMode(
	keybindings: readonly SurfaceKeybinding[] | undefined,
	mode: EditorMode,
): readonly SurfaceKeybinding[] {
	return (keybindings ?? []).filter((binding) => binding.mode === mode);
}
