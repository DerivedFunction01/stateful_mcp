import type {
	CommandDescriptorDto,
	EffectiveKeymapDto,
	KeymapBindingDto,
} from "@stateful-mcp/macro-protocol";
import { classifyChord } from "../lib/browser-shortcut-policy";
import { useI18n } from "../lib/macro-i18n-provider";

export interface KeymapShortcutsProps {
	readonly keymap: EffectiveKeymapDto;
	readonly commands: readonly CommandDescriptorDto[];
}

/**
 * Read-only display of the effective keymap: each binding's chord, owning
 * source, and browser capability. Conflicting or non-page-default chords are
 * surfaced as structured diagnostics.
 */
export function KeymapShortcuts({ keymap }: KeymapShortcutsProps) {
	const { t } = useI18n();
	const effectiveBindings: readonly KeymapBindingDto[] = keymap.bindings;
	const seen = new Map<string, string[]>();
	for (const binding of effectiveBindings) {
		for (const chord of binding.chords) {
			const key = chord.toLowerCase();
			const list = seen.get(key) ?? [];
			list.push(binding.command);
			seen.set(key, list);
		}
	}
	const conflicts = new Map<string, string[]>();
	for (const [chord, commandList] of seen) {
		if (commandList.length > 1) conflicts.set(chord, commandList);
	}

	return (
		<div className="keymap-shortcuts">
			<h3>{keymap.name}</h3>
			<ul className="keymap-shortcuts__list">
				{effectiveBindings.length === 0 ? (
					<li className="keymap-shortcuts__empty">{t("common.noResults")}</li>
				) : (
					effectiveBindings.map((binding: KeymapBindingDto) => {
						const chord = binding.chords[0] ?? "";
						const policy = chord ? classifyChord(chord) : null;
						const conflict = conflicts.get(chord.toLowerCase());
						const warns =
							policy &&
							(policy.disposition === "conditional" ||
								policy.disposition === "browser-chrome" ||
								policy.disposition === "platform-reserved" ||
								policy.disposition === "unknown" ||
								policy.nativeEditing);
						return (
							<li
								key={`${binding.command}-${chord}`}
								className="keymap-shortcuts__row"
							>
								<span className="keymap-shortcuts__command">
									{binding.command}
								</span>
								<span className="keymap-shortcuts__chord">{chord}</span>
								{binding.source ? (
									<span className="keymap-shortcuts__source">
										{t(`keymap.source.${binding.source}`)}
									</span>
								) : null}
								{conflict ? (
									<span className="keymap-shortcuts__warn">
										{t("keymap.conflict")}: {conflict.join(", ")}
									</span>
								) : warns ? (
									<span className="keymap-shortcuts__warn">
										{policy!.disposition === "conditional"
											? t("keymap.conditional")
											: t("keymap.unavailable")}
									</span>
								) : null}
							</li>
						);
					})
				)}
			</ul>
		</div>
	);
}
