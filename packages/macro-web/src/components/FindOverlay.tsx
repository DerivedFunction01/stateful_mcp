import type { SearchDirection } from "@stateful-mcp/macro-protocol";
import { useEffect, useRef, useState } from "react";
import type { EditorSearchResult } from "../lib/browser-vim";
import { useI18n } from "../lib/macro-i18n-provider";
import { unescapeReplacementString, unescapeSearchPattern } from "../lib/search-utils";
import { SearchReplaceBar, type SearchOptions } from "./SearchReplaceBar";

export interface FindOverlayProps {
	readonly direction: SearchDirection;
	readonly initialQuery?: string;
	readonly initialReplacement?: string;
	readonly onFind: (query: string, direction: SearchDirection, navigate?: boolean, options?: SearchOptions) => boolean | EditorSearchResult;
	readonly onReplace?: (query: string, replacement: string, options?: SearchOptions) => boolean;
	readonly onReplaceAll?: (query: string, replacement: string, options?: SearchOptions) => number;
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
	const onFindRef = useRef(onFind);
	const [query, setQuery] = useState(initialQuery);
	const [replacement, setReplacement] = useState(initialReplacement);
	const [message, setMessage] = useState("");
	const [replaceOpen, setReplaceOpen] = useState(true);
	const [options, setOptions] = useState<SearchOptions>({ matchCase: false, wholeWord: false, regex: false });
	onFindRef.current = onFind;

	const find = (searchDirection = direction, navigate = false) => {
		if (!query) {
			setMessage("");
			onFindRef.current("", searchDirection, false, options);
			return;
		}
		const result = onFindRef.current(unescapeSearchPattern(query, options.regex), searchDirection, navigate, options);
		if (typeof result === "boolean") {
			setMessage(result ? "" : t("editor.find.noResults"));
			return;
		}
		setMessage(result.matches.length > 0 ? t("editor.find.matchCount", { current: result.activeMatchIndex + 1, count: result.matches.length }) : t("editor.find.noResults"));
	};

	useEffect(() => { find(direction, false); }, [query, direction, options]);

	const replace = () => {
		if (!query || !onReplace) return;
		const replaced = onReplace(unescapeSearchPattern(query, options.regex), unescapeReplacementString(replacement), options);
		if (replaced) requestAnimationFrame(() => find("forward", true));
		else setMessage(t("editor.find.noResults"));
	};

	const replaceAll = () => {
		if (!query || !onReplaceAll || !window.confirm(t("editor.find.replaceAllConfirm"))) return;
		const count = onReplaceAll(unescapeSearchPattern(query, options.regex), unescapeReplacementString(replacement), options);
		setMessage(count > 0 ? t("editor.find.matchesReplaced", { count }) : t("editor.find.noResults"));
	};

	return (
		<div className="editor-find-widget" role="dialog" aria-label={t("editor.find.ariaLabel")}>
			<SearchReplaceBar
				query={query}
				replacement={replacement}
				options={options}
				message={message}
				replaceOpen={replaceOpen}
				showClose
				onQueryChange={(value) => { setQuery(value); onQueryChange?.(value); }}
				onReplacementChange={(value) => { setReplacement(value); onReplacementChange?.(value); }}
				onOptionsChange={setOptions}
				onQuerySubmit={() => find("forward", true)}
				onReplacementSubmit={replace}
				onNavigate={(searchDirection) => find(searchDirection, true)}
				onReplace={replace}
				onReplaceAll={replaceAll}
				onToggleReplace={() => setReplaceOpen((open) => !open)}
				onClose={() => { onFindRef.current("", direction, false, options); onClose(); }}
			/>
		</div>
	);
}
