import { Box, Text, useInput } from "ink";

export interface SearchState {
	query: string;
	matches: string[];
	matchIndex: number;
	open: boolean;
}

export type SearchAction =
	| {
			type: "OPEN";
			query?: string;
            cells: { cellId: string; authored: { rawText: string } }[];
	  }
	| {
			type: "UPDATE_QUERY";
			query: string;
            cells: { cellId: string; authored: { rawText: string } }[];
	  }
	| { type: "NEXT" }
	| { type: "PREV" }
	| { type: "CLOSE" }
	| { type: "CLEAR" };

export const INITIAL_SEARCH_STATE: SearchState = {
	query: "",
	matches: [],
	matchIndex: -1,
	open: false,
};

export function getSearchMatches(
	query: string,
    cells: { cellId: string; authored: { rawText: string } }[],
): string[] {
	if (!query) return [];
	const lowerQuery = query.toLowerCase();
	return cells
        .filter((cell) => cell.authored.rawText.toLowerCase().includes(lowerQuery))
		.map((cell) => cell.cellId);
}

export function searchReducer(
	state: SearchState,
	action: SearchAction,
): SearchState {
	switch (action.type) {
		case "OPEN": {
			const query = action.query ?? state.query;
			const matches = getSearchMatches(query, action.cells);
			return {
				query,
				matches,
				matchIndex: matches.length > 0 ? 0 : -1,
				open: true,
			};
		}
		case "UPDATE_QUERY": {
			const matches = getSearchMatches(action.query, action.cells);
			return {
				...state,
				query: action.query,
				matches,
				matchIndex: matches.length > 0 ? 0 : -1,
			};
		}
		case "NEXT": {
			if (state.matches.length === 0) return state;
			return {
				...state,
				matchIndex: (state.matchIndex + 1) % state.matches.length,
			};
		}
		case "PREV": {
			if (state.matches.length === 0) return state;
			return {
				...state,
				matchIndex:
					(state.matchIndex - 1 + state.matches.length) % state.matches.length,
			};
		}
		case "CLOSE":
			return {
				...state,
				open: false,
			};
		case "CLEAR":
			return {
				query: "",
				matches: [],
				matchIndex: -1,
				open: false,
			};
		default:
			return state;
	}
}

interface SearchOverlayProps {
	query: string;
	matchIndex: number;
	matchCount: number;
	onChangeQuery: (query: string) => void;
	onNext: () => void;
	onPrev: () => void;
	onSelect: () => void;
	onClose: () => void;
}

export function SearchOverlay({
	query,
	matchIndex,
	matchCount,
	onChangeQuery,
	onNext,
	onPrev,
	onSelect,
	onClose,
}: SearchOverlayProps) {
	useInput((input, key) => {
		if (key.escape) {
			onClose();
			return;
		}
		if (key.return) {
			onSelect();
			return;
		}
		if (key.backspace || key.delete) {
			onChangeQuery(query.slice(0, -1));
			return;
		}
		if (
			key.downArrow ||
			key.rightArrow ||
			(key.ctrl && (input === "n" || input === "s"))
		) {
			onNext();
			return;
		}
		if (
			key.upArrow ||
			key.leftArrow ||
			(key.ctrl && (input === "N" || input === "S" || input === "p"))
		) {
			onPrev();
			return;
		}
		// Type printable characters
		if (input && !key.ctrl && !key.meta && input.length === 1 && input >= " ") {
			onChangeQuery(query + input);
		}
	});

	return (
		<Box
			flexDirection="row"
			borderStyle="single"
			borderColor="cyan"
			paddingX={1}
			width="100%"
		>
			<Text bold color="cyan">
				Search:{" "}
			</Text>
			<Text>{query}</Text>
			<Text color="gray">_</Text>
			<Box flexGrow={1} />
			<Text color="yellow">
				{matchCount > 0 ? `${matchIndex + 1} of ${matchCount}` : "0 matches"}
			</Text>
		</Box>
	);
}
