import type { SearchDirection } from "@stateful-mcp/macro-protocol";
import {
	CaseSensitive,
	ChevronDown,
	ChevronUp,
	Regex,
	Replace,
	ReplaceAll,
	Settings2,
	WholeWord,
	X,
} from "lucide-react";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useI18n } from "../lib/macro-i18n-provider";
import {
	insertAtCaret,
	isLiteralNewlineEvent,
	resizeTextareaToContent,
} from "../lib/search-utils";
import { IconButton } from "./ui/primitives";

export interface SearchOptions {
	readonly matchCase: boolean;
	readonly wholeWord: boolean;
	readonly regex: boolean;
}

export interface SearchReplaceBarProps {
	readonly query: string;
	readonly replacement: string;
	readonly options: SearchOptions;
	readonly message?: string;
	readonly replaceOpen: boolean;
	readonly showClose?: boolean;
	readonly autoFocus?: boolean;
	readonly selectQueryOnFocus?: boolean;
	readonly onAccept?: () => void;
	readonly onCancel?: () => void;
	readonly onQueryChange: (value: string) => void;
	readonly onReplacementChange: (value: string) => void;
	readonly onOptionsChange: (options: SearchOptions) => void;
	readonly onQuerySubmit?: () => void;
	readonly onReplacementSubmit?: () => void;
	readonly onNavigate?: (direction: SearchDirection) => void;
	readonly onReplace?: () => void;
	readonly onReplaceAll?: () => void;
	readonly onToggleReplace: () => void;
	readonly onClose?: () => void;
}

export function SearchReplaceBar({
	query,
	replacement,
	options,
	message,
	replaceOpen,
	showClose = false,
	autoFocus = false,
	selectQueryOnFocus = false,
	onAccept,
	onCancel,
	onQueryChange,
	onReplacementChange,
	onOptionsChange,
	onQuerySubmit,
	onReplacementSubmit,
	onNavigate,
	onReplace,
	onReplaceAll,
	onToggleReplace,
	onClose,
}: SearchReplaceBarProps) {
	const { t } = useI18n();
	const [settingsOpen, setSettingsOpen] = useState(false);
	const barRef = useRef<HTMLDivElement>(null);
	const queryRef = useRef<HTMLTextAreaElement>(null);
	const replacementRef = useRef<HTMLTextAreaElement>(null);

	useEffect(() => {
		if (autoFocus) {
			const frame = requestAnimationFrame(() => {
				queryRef.current?.focus();
				if (selectQueryOnFocus) queryRef.current?.select();
			});
			return () => cancelAnimationFrame(frame);
		}
	}, [autoFocus, selectQueryOnFocus]);

	useEffect(() => {
		if (queryRef.current) resizeTextareaToContent(queryRef.current);
		if (replacementRef.current) resizeTextareaToContent(replacementRef.current);
	}, [query, replacement]);

	useEffect(() => {
		if (!settingsOpen) return;
		const handlePointerDown = (event: PointerEvent) => {
			if (!barRef.current?.contains(event.target as Node)) {
				setSettingsOpen(false);
			}
		};
		document.addEventListener("pointerdown", handlePointerDown);
		return () => document.removeEventListener("pointerdown", handlePointerDown);
	}, [settingsOpen]);

	const handleInputKeyDown = (
		event: KeyboardEvent<HTMLTextAreaElement>,
		replacementInput: boolean,
	) => {
		if (isLiteralNewlineEvent(event) || event.key === "Tab") {
			event.preventDefault();
			insertAtCaret(
				event.currentTarget,
				event.key === "Tab" ? "\t" : "\n",
				replacementInput ? onReplacementChange : onQueryChange,
			);
			return;
		}
		if (event.key === "Enter") {
			event.preventDefault();
			if (replacementInput) onReplacementSubmit?.();
			else (onAccept ?? onQuerySubmit)?.();
			return;
		}
		if (event.key === "Escape") {
			event.preventDefault();
			onCancel?.();
			return;
		}
		if (!replacementInput && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
			event.preventDefault();
			onNavigate?.(event.key === "ArrowUp" ? "backward" : "forward");
		}
	};

	return (
		<div ref={barRef} className="search-replace-bar">
			<div
				className="search-replace-keyboard-surface"
				onKeyDown={(event) => {
					if (event.key === "Escape") {
						event.preventDefault();
						onCancel?.();
					}
				}}
			>
			<div className="search-replace-row">
				<button type="button" className="search-replace-toggle" onClick={onToggleReplace} aria-expanded={replaceOpen}>
					{replaceOpen ? <ChevronDown size={13} /> : <ChevronUp size={13} />}
				</button>
				<textarea
					ref={queryRef}
					className={`search-field ${query.includes("\n") ? "" : "single-line"}`}
					rows={1}
					value={query}
					aria-label={t("editor.find.inputLabel")}
					placeholder={t("editor.find.inputLabel")}
					onChange={(event) => onQueryChange(event.target.value)}
					onKeyDown={(event) => handleInputKeyDown(event, false)}
				/>
				<span className="search-replace-message" aria-live="polite">{message}</span>
				<div className="search-replace-actions">
					<IconButton label={t("editor.find.backward")} onClick={() => onNavigate?.("backward")}>
						<ChevronUp size={15} aria-hidden="true" />
					</IconButton>
					<IconButton label={t("editor.find.forward")} onClick={() => onNavigate?.("forward")}>
						<ChevronDown size={15} aria-hidden="true" />
					</IconButton>
					<IconButton
						label={t("editor.find.options")}
						className={settingsOpen ? "active" : undefined}
						aria-expanded={settingsOpen}
						onClick={() => setSettingsOpen((open) => !open)}
					>
						<Settings2 size={15} aria-hidden="true" />
					</IconButton>
					{showClose && <IconButton label={t("editor.find.close")} onClick={onClose}><X size={15} /></IconButton>}
				</div>
				{settingsOpen && (
					<div className="search-options-popover" role="menu">
						{([
							["matchCase", "workbench.matchCase", CaseSensitive],
							["wholeWord", "workbench.matchWholeWord", WholeWord],
							["regex", "workbench.useRegex", Regex],
						] as const).map(([key, label, Icon]) => (
							<button
								key={key}
								type="button"
								className={options[key] ? "active" : undefined}
								aria-pressed={options[key]}
								onClick={() => onOptionsChange({ ...options, [key]: !options[key] })}
							>
								<Icon size={13} /> {t(label as never)}
							</button>
						))}
					</div>
				)}
			</div>
			{replaceOpen && (
				<div className="search-replace-row">
					<span className="search-replace-toggle-spacer" />
					<textarea
						ref={replacementRef}
						className={`search-field ${replacement.includes("\n") ? "" : "single-line"}`}
						rows={1}
						value={replacement}
						aria-label={t("editor.find.replaceLabel")}
						placeholder={t("editor.find.replaceLabel")}
						onChange={(event) => onReplacementChange(event.target.value)}
						onKeyDown={(event) => handleInputKeyDown(event, true)}
					/>
					<div className="search-replace-actions">
						<IconButton label={t("editor.find.replaceAction")} onClick={onReplace} disabled={!onReplace}><Replace size={15} /></IconButton>
						<IconButton label={t("editor.find.replaceAllAction")} onClick={onReplaceAll} disabled={!onReplaceAll}><ReplaceAll size={15} /></IconButton>
					</div>
				</div>
			)}
			</div>
		</div>
	);
}
