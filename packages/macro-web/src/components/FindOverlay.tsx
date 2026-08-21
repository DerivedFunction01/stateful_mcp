import { ChevronDown, ChevronUp, Replace, Settings2, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import type { EditorSearchResult } from "../lib/browser-vim";
import { useI18n } from "../lib/macro-i18n-provider";
import { IconButton } from "./ui/primitives";

export interface FindOverlayProps {
	readonly direction: "forward" | "backward";
	readonly initialQuery?: string;
	readonly initialReplacement?: string;
	readonly onFind: (
		query: string,
		direction: "forward" | "backward",
	) => boolean | EditorSearchResult;
	readonly onReplace?: (query: string, replacement: string) => boolean;
	readonly onReplaceAll?: (query: string, replacement: string) => number;
	readonly onQueryChange?: (query: string) => void;
	readonly onReplacementChange?: (replacement: string) => void;
	readonly onClose: () => void;
}

export function FindOverlay({
	direction,
	initialQuery = "",
	initialReplacement = "",
	onFind,
	onReplace,
	onReplaceAll,
	onQueryChange,
	onReplacementChange,
	onClose,
}: FindOverlayProps) {
	const { t } = useI18n();
	const inputRef = useRef<HTMLInputElement>(null);
	const findId = useId();
	const onFindRef = useRef(onFind);
	const [query, setQuery] = useState(initialQuery);
	const [replacement, setReplacement] = useState(initialReplacement);
	const [message, setMessage] = useState("");
	const [replaceOpen, setReplaceOpen] = useState(true);

	onFindRef.current = onFind;

	useEffect(() => {
		inputRef.current?.focus();
	}, []);

	function find(searchDirection = direction): void {
		if (!query) {
			setMessage("");
			return;
		}
		const result = onFindRef.current(query, searchDirection);
		if (typeof result === "boolean") {
			setMessage(result ? "" : t("editor.find.noResults"));
			return;
		}
		setMessage(
			result.matches.length > 0
				? t("editor.find.matchCount", {
						current: result.activeMatchIndex + 1,
						count: result.matches.length,
					})
				: t("editor.find.noResults"),
		);
	}

	useEffect(() => {
		find();
		// Search intentionally follows query and direction only. The ref prevents
		// parent callback identity changes from retriggering the search loop.
	}, [query, direction]);

	function replace(): void {
		if (!query || !onReplace) return;
		setMessage(onReplace(query, replacement) ? "" : t("editor.find.noResults"));
	}

	function replaceAll(): void {
		if (!query || !onReplaceAll) return;
		if (!window.confirm(t("editor.find.replaceAllConfirm"))) return;
		const count = onReplaceAll(query, replacement);
		setMessage(
			count > 0
				? t("editor.find.matchesReplaced", { count })
				: t("editor.find.noResults"),
		);
	}

	return (
		<div
			className="editor-find-widget"
			role="dialog"
			aria-label={t("editor.find.ariaLabel")}
			onKeyDown={(event) => {
				if (event.key === "Escape") {
					event.preventDefault();
					onClose();
				} else if (event.key === "Enter") {
					event.preventDefault();
					find(event.shiftKey ? "backward" : direction);
				}
			}}
		>
			<div className="find-row">
				<label htmlFor={`${findId}-query`}>{t("editor.find.inputLabel")}</label>
				<input
					ref={inputRef}
					id={`${findId}-query`}
					value={query}
					placeholder={t("editor.find.inputLabel")}
					onChange={(event) => {
						setQuery(event.target.value);
						onQueryChange?.(event.target.value);
					}}
				/>
				<div className="find-actions">
					<span className="find-message" aria-live="polite">
						{message}
					</span>
					<IconButton
						label={t("editor.find.backward")}
						onClick={() => find("backward")}
					>
						<ChevronUp size={15} aria-hidden="true" />
					</IconButton>
					<IconButton
						label={t("editor.find.forward")}
						onClick={() => find("forward")}
					>
						<ChevronDown size={15} aria-hidden="true" />
					</IconButton>
					<IconButton
						label={t("editor.find.options")}
						onClick={() => setReplaceOpen((open) => !open)}
						aria-expanded={replaceOpen}
					>
						<Settings2 size={15} aria-hidden="true" />
					</IconButton>
					<IconButton label={t("editor.find.close")} onClick={onClose}>
						<X size={15} aria-hidden="true" />
					</IconButton>
				</div>
			</div>
			{replaceOpen && (
				<div className="find-row find-replace-row">
					<label htmlFor={`${findId}-replacement`}>
						{t("editor.find.replaceLabel")}
					</label>
					<input
						id={`${findId}-replacement`}
						value={replacement}
						onChange={(event) => {
							setReplacement(event.target.value);
							onReplacementChange?.(event.target.value);
						}}
					/>
					<div className="find-actions">
						<IconButton
							label={t("editor.find.replaceAction")}
							onClick={replace}
							disabled={!onReplace}
						>
							<Replace size={15} aria-hidden="true" />
						</IconButton>
						<IconButton
							label={t("editor.find.replaceAllAction")}
							onClick={replaceAll}
							disabled={!onReplaceAll}
						>
							<Replace size={15} aria-hidden="true" />
						</IconButton>
					</div>
				</div>
			)}
		</div>
	);
}
