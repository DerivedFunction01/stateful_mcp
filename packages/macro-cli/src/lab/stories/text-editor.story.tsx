import {
	type TextEditorDiagnostic,
	type TextEditorLine,
	TextEditorWindowView,
} from "../../components/TextEditorWindow";
import { GlobalThemeRegistry } from "../../ui/theme";
import type { TuiStory } from "../story-contract";

const JSON_LINES: readonly TextEditorLine[] = [
	{
		num: 1,
		tokens: [{ text: "{", color: "punct" }],
	},
	{
		num: 2,
		tokens: [
			{ text: '  "id"', color: "key" },
			{ text: ": ", color: "punct" },
			{ text: '"spanish"', color: "string" },
			{ text: ",", color: "punct" },
		],
	},
	{
		num: 3,
		tokens: [
			{ text: '  "extends"', color: "key" },
			{ text: ": ", color: "punct" },
			{ text: '"base"', color: "string" },
			{ text: ",", color: "punct" },
		],
	},
	{
		num: 4,
		tokens: [
			{ text: '  "locale"', color: "key" },
			{ text: ": ", color: "punct" },
			{ text: '"es-ES"', color: "string" },
			{ text: ",", color: "punct" },
		],
	},
	{
		num: 5,
		isCursorLine: true,
		hasGutterMarker: "dirty",
		tokens: [
			{ text: '  "decimalSeparator"', color: "key" },
			{ text: ": ", color: "punct" },
			{ text: '","', color: "string" },
			{ text: ",", color: "punct" },
		],
	},
	{
		num: 6,
		tokens: [
			{ text: '  "unitAliases"', color: "key" },
			{ text: ": {", color: "punct" },
		],
	},
	{
		num: 7,
		tokens: [
			{ text: '    "mass::milligram"', color: "key" },
			{ text: ": [", color: "punct" },
			{ text: '"miligramos"', color: "string" },
			{ text: "],", color: "punct" },
		],
	},
	{
		num: 8,
		hasGutterMarker: "dirty",
		tokens: [
			{ text: '    "volume::milliliter"', color: "key" },
			{ text: ": [", color: "punct" },
			{ text: '"mililitros"', color: "string" },
			{ text: "]", color: "punct" },
		],
	},
	{
		num: 9,
		tokens: [{ text: "  },", color: "punct" }],
	},
	{
		num: 10,
		tokens: [
			{ text: '  "rangeDelimiters"', color: "key" },
			{ text: ": [", color: "punct" },
			{ text: '"hasta"', color: "string" },
			{ text: ", ", color: "punct" },
			{ text: '"a"', color: "string" },
			{ text: "]", color: "punct" },
		],
	},
	{
		num: 11,
		tokens: [{ text: "}", color: "punct" }],
	},
];

const DIAGNOSTICS: readonly TextEditorDiagnostic[] = [
	{
		line: 8,
		col: 31,
		message: "Expected comma or closing bracket after property value",
		severity: "error",
	},
];

export const genericTextEditorStory: TuiStory = {
	id: "generic-text-editor",
	title: "Generic Text Editor Tab (Document Buffer)",
	category: "Views",
	states: [
		"json-document",
		"dirty-unsaved",
		"syntax-diagnostic",
		"markdown-note",
	],
	render(context) {
		const theme = GlobalThemeRegistry.getActive();
		const state = context.stateId;
		const isDiagnostic = state === "syntax-diagnostic";
		const isDirty = state === "dirty-unsaved";
		const isMarkdown = state === "markdown-note";

		const width = Math.min(108, context.size.columns - 4);
		const height = Math.min(24, context.size.rows - 4);

		if (isMarkdown) {
			const mdLines: readonly TextEditorLine[] = [
				{
					num: 1,
					tokens: [{ text: "# Workspace Guidelines", color: "key" }],
				},
				{
					num: 2,
					tokens: [{ text: "This workspace enforces SI units and sparse profile extensions.", color: "dim" }],
				},
				{
					num: 3,
					isCursorLine: true,
					tokens: [{ text: "- Base profile defines physical dimensions and canonical operators.", color: "accent" }],
				},
			];

			return (
				<TextEditorWindowView
					documentUri="workspace://notes/rules.md"
					lines={mdLines}
					cursorLine={3}
					cursorCol={1}
					languageId="Markdown"
					isDirty={false}
					width={width}
					height={height}
					theme={theme}
				/>
			);
		}

		return (
			<TextEditorWindowView
				documentUri="macro://profiles/spanish.json"
				lines={JSON_LINES}
				cursorLine={5}
				cursorCol={24}
				languageId="JSON"
				isDirty={isDirty}
				diagnostics={isDiagnostic ? DIAGNOSTICS : []}
				width={width}
				height={height}
				theme={theme}
			/>
		);
	},
};
