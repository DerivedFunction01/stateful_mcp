import type { EditorKeymapProfile } from "@stateful-mcp/macro";

function isChordValue(value: unknown): boolean {
	if (typeof value === "string") return true;
	if (Array.isArray(value))
		return value.every((chord) => typeof chord === "string");
	return false;
}

function isBindingSection(value: unknown): boolean {
	if (typeof value !== "object" || value === null) return false;
	const record = value as Record<string, unknown>;
	return Object.values(record).every(isChordValue);
}

/**
 * Runtime guard for an incoming keymap profile supplied over the host boundary.
 * Replaces the previous `payload.keymap as never` cast with a validated
 * projection that is safe to forward to `HostSessionManager.create`.
 */
export function parseKeymapProfile(
	value: unknown,
): Partial<EditorKeymapProfile> | undefined {
	if (value === undefined) return undefined;
	if (typeof value !== "object" || value === null) return undefined;
	const candidate = value as Record<string, unknown>;
	if (
		candidate.profileId !== undefined &&
		typeof candidate.profileId !== "string"
	)
		return undefined;
	if (candidate.name !== undefined && typeof candidate.name !== "string")
		return undefined;
	if (
		candidate.description !== undefined &&
		typeof candidate.description !== "string"
	)
		return undefined;
	if (candidate.normal !== undefined && !isBindingSection(candidate.normal))
		return undefined;
	if (candidate.visual !== undefined && !isBindingSection(candidate.visual))
		return undefined;
	if (
		candidate.sequences !== undefined &&
		!isBindingSection(candidate.sequences)
	)
		return undefined;
	if (candidate.keybindings !== undefined) {
		if (
			typeof candidate.keybindings !== "object" ||
			candidate.keybindings === null
		)
			return undefined;
		if (
			!Object.values(candidate.keybindings as Record<string, unknown>).every(
				isChordValue,
			)
		)
			return undefined;
	}
	if (candidate.aliases !== undefined) {
		if (typeof candidate.aliases !== "object" || candidate.aliases === null)
			return undefined;
	}
	if (candidate.vim !== undefined) {
		if (typeof candidate.vim !== "object" || candidate.vim === null)
			return undefined;
	}
	return candidate as Partial<EditorKeymapProfile>;
}
