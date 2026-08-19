import type { CommandDescriptorDto } from "@stateful-mcp/macro-protocol";
import { useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "../lib/macro-i18n-provider";

interface CommandPaletteProps {
	readonly commands: readonly CommandDescriptorDto[];
	readonly onExecute: (
		commandId: string,
		args?: readonly unknown[],
	) => Promise<void>;
	readonly onClose: () => void;
}

interface RankedCommand {
	readonly descriptor: CommandDescriptorDto;
	readonly exact: boolean;
}

function rankCommands(
	commands: readonly CommandDescriptorDto[],
	query: string,
): RankedCommand[] {
	const q = query.trim().toLowerCase();
	if (!q) {
		return commands.map((descriptor) => ({ descriptor, exact: false }));
	}
	const scored: RankedCommand[] = [];
	for (const descriptor of commands) {
		const haystack = [
			descriptor.id,
			descriptor.title,
			descriptor.category ?? "",
			descriptor.description ?? "",
			descriptor.extensionId ?? "",
			...(descriptor.aliases ?? []),
			...(descriptor.verb ? [descriptor.verb] : []),
		]
			.join(" ")
			.toLowerCase();
		const idMatch = descriptor.id.toLowerCase() === q;
		const aliasMatch = (descriptor.aliases ?? []).some(
			(alias) => alias.toLowerCase() === q,
		);
		const verbMatch =
			descriptor.verb != null && descriptor.verb.toLowerCase() === q;
		if (idMatch || aliasMatch || verbMatch)
			scored.push({ descriptor, exact: true });
		else if (haystack.includes(q)) scored.push({ descriptor, exact: false });
	}
	// Exact id/alias/verb matches rank above fuzzy title/description matches.
	return scored.sort((a, b) => Number(b.exact) - Number(a.exact));
}

export function CommandPalette({
	commands,
	onExecute,
	onClose,
}: CommandPaletteProps) {
	const { t } = useI18n();
	const [query, setQuery] = useState("");
	const [selected, setSelected] = useState(0);
	const [argsValues, setArgsValues] = useState<Record<string, string>>({});
	const [pending, setPending] = useState(false);
	const [error, setError] = useState<string | undefined>();
	const inputRef = useRef<HTMLInputElement>(null);
	const listRef = useRef<HTMLDivElement>(null);
	const dialogRef = useRef<HTMLDivElement>(null);

	const ranked = useMemo(
		() => rankCommands(commands, query),
		[commands, query],
	);
	const selectedCommand = ranked[selected]?.descriptor;

	useEffect(() => {
		inputRef.current?.focus();
	}, []);
	useEffect(() => {
		setSelected(0);
		setArgsValues({});
		setError(undefined);
	}, [query]);

	useEffect(() => {
		const node = listRef.current?.querySelector<HTMLElement>(
			`[data-index="${selected}"]`,
		);
		node?.scrollIntoView({ block: "nearest" });
	}, [selected]);

	function move(delta: 1 | -1): void {
		if (ranked.length === 0) return;
		setSelected((prev) => (prev + delta + ranked.length) % ranked.length);
	}

	async function run(command = selectedCommand): Promise<void> {
		if (!command || pending) return;
		const missing = command.args?.find(
			(arg) => arg.required && !(argsValues[arg.name] ?? "").trim(),
		);
		if (missing) {
			setError(`${t("palette.requiredArgument")}: ${missing.name}`);
			return;
		}
		const args = command.args?.map((arg) => argsValues[arg.name] ?? "");
		setPending(true);
		setError(undefined);
		try {
			await onExecute(command.id, args && args.length > 0 ? args : undefined);
		} catch {
			setError(t("palette.executionFailed"));
		} finally {
			setPending(false);
		}
	}

	function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>): void {
		if (event.key === "Escape") {
			event.preventDefault();
			onClose();
			return;
		}
		if (event.key === "ArrowDown") {
			event.preventDefault();
			move(1);
			return;
		}
		if (event.key === "ArrowUp") {
			event.preventDefault();
			move(-1);
			return;
		}
		if (event.key === "Enter") {
			event.preventDefault();
			void run();
			return;
		}
		if (event.key === "Tab") {
			const focusable = Array.from(
				dialogRef.current?.querySelectorAll<HTMLElement>(
					"input, button, [tabindex='0']",
				) ?? [],
			);
			if (focusable.length === 0) return;
			const first = focusable[0];
			const last = focusable[focusable.length - 1];
			if (!first || !last) return;
			if (event.shiftKey && document.activeElement === first) {
				event.preventDefault();
				last.focus();
			} else if (!event.shiftKey && document.activeElement === last) {
				event.preventDefault();
				first.focus();
			}
		}
	}

	const title = t("palette.title");
	const liveMessage = ranked.length
		? `${ranked.length} ${t("palette.results")}`
		: t("palette.noResults");

	return (
		<div
			className="command-palette-overlay"
			onMouseDown={(event) => {
				if (event.target === event.currentTarget) onClose();
			}}
		>
			<div
				ref={dialogRef}
				className="command-palette"
				role="dialog"
				aria-modal="true"
				aria-label={title}
				onKeyDown={onKeyDown}
			>
				<div className="command-palette__header">
					<input
						ref={inputRef}
						className="command-palette__input"
						type="text"
						role="combobox"
						aria-expanded="true"
						aria-controls="command-palette-list"
						aria-autocomplete="list"
						aria-activedescendant={
							selectedCommand ? `command-option-${selected}` : undefined
						}
						placeholder={t("palette.placeholder")}
						value={query}
						onChange={(event) => setQuery(event.target.value)}
					/>
					<span className="command-palette__badge" aria-hidden="true">
						{title}
					</span>
				</div>

				<div
					ref={listRef}
					id="command-palette-list"
					className="command-palette__list"
					role="listbox"
					aria-label={title}
				>
					{ranked.length === 0 ? (
						<div className="command-palette__empty">
							{t("palette.noResults")}
						</div>
					) : (
						ranked.map((item, index) => {
							const descriptor = item.descriptor;
							const isSelected = index === selected;
							return (
								<div
									key={descriptor.id}
									id={`command-option-${index}`}
									data-index={index}
									role="option"
									tabIndex={-1}
									aria-selected={isSelected}
									className={
										isSelected
											? "command-palette__option command-palette__option--active"
											: "command-palette__option"
									}
									onMouseEnter={() => setSelected(index)}
									onMouseDown={(event) => {
										event.preventDefault();
										setSelected(index);
										if (!descriptor.args?.length) void run(descriptor);
									}}
								>
									<span className="command-palette__option-title">
										{descriptor.title}
									</span>
									{descriptor.category ? (
										<span className="command-palette__option-category">
											{descriptor.category}
										</span>
									) : null}
									{descriptor.keybinding ? (
										<span className="command-palette__option-key">
											{descriptor.keybinding}
										</span>
									) : null}
								</div>
							);
						})
					)}
				</div>

				{selectedCommand?.args && selectedCommand.args.length > 0 ? (
					<div className="command-palette__args">
						<strong>{t("palette.arguments")}</strong>
						{selectedCommand.args.map((arg) => (
							<label key={arg.name} className="command-palette__arg">
								<span>
									{arg.name}
									<span className="command-palette__arg-kind">
										{arg.required
											? t("palette.argumentRequired")
											: t("palette.argumentOptional")}
									</span>
								</span>
								<input
									type="text"
									value={argsValues[arg.name] ?? ""}
									onChange={(event) =>
										setArgsValues((prev) => ({
											...prev,
											[arg.name]: event.target.value,
										}))
									}
								/>
							</label>
						))}
					</div>
				) : null}

				<div className="command-palette__footer">
					<button
						type="button"
						className="button button-primary"
						disabled={!selectedCommand || pending}
						onClick={() => void run()}
					>
						{pending ? t("palette.pending") : t("palette.run")}
					</button>
					<span className="command-palette__live" aria-live="polite">
						{error ?? liveMessage}
					</span>
				</div>
			</div>
		</div>
	);
}
