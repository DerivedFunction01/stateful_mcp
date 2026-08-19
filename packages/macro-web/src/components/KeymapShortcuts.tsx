import type {
	CommandDescriptorDto,
	EffectiveKeymapDto,
	KeymapBindingDto,
} from "@stateful-mcp/macro-protocol";
import {
	classifyChord,
	normalizePrimary,
} from "../lib/browser-shortcut-policy";
import { BROWSER_WORKBENCH_BASELINE } from "../lib/browser-workbench-defaults";
import { useI18n } from "../lib/macro-i18n-provider";

interface KeymapShortcutsProps {
	readonly keymap: EffectiveKeymapDto;
	readonly commands: readonly CommandDescriptorDto[];
}

/**
 * Read-only display of the effective keymap: each binding's chord, owning
 * source, and browser capability. Conflicting or non-page-default chords are
 * surfaced as structured diagnostics. This is a viewer only; editing/persisting
 * overrides is deferred to a later phase.
 */
export function KeymapShortcuts({ keymap, commands }: KeymapShortcutsProps) {
	const { t } = useI18n();
	const commandIds = new Set(commands.map((command) => command.id));
	const explicitChords = new Set(
		keymap.bindings.flatMap((binding) =>
			binding.chords.map((chord) => normalizePrimary(chord)),
		),
	);
	const baselineBindings: KeymapBindingDto[] =
		BROWSER_WORKBENCH_BASELINE.filter(
			(binding) =>
				commandIds.has(binding.command) &&
				!explicitChords.has(normalizePrimary(binding.chord)),
		).map((binding) => ({
			command: binding.command,
			chords: [binding.chord],
			source: "browser-baseline",
		}));
	const effectiveBindings = [...keymap.bindings, ...baselineBindings];
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
	for (const [chord, commands] of seen) {
		if (commands.length > 1) conflicts.set(chord, commands);
	}

	return (
		<div className="keymap-shortcuts">
			<h3>{keymap.name}</h3>
			<ul className="keymap-shortcuts__list">
				{effectiveBindings.length === 0 ? (
					<li className="keymap-shortcuts__empty">{t("common.noResults")}</li>
				) : (
					effectiveBindings.map((binding) => {
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
