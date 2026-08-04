import type { CellPreview } from "@stateful-mcp/clinical/cells/cell-service-types";
import { Box, Text, useInput } from "ink";

interface PreviewScreenProps {
	preview: CellPreview;
	onAccept: () => void;
	onEdit: () => void;
	onCancel: () => void;
}

export function PreviewScreen({
	preview,
	onAccept,
	onEdit,
	onCancel,
}: PreviewScreenProps) {
	useInput((input, key) => {
		if (input.toLowerCase() === "a") return onAccept();
		if (input.toLowerCase() === "e") return onEdit();
		if (
			key.escape ||
			input.toLowerCase() === "c" ||
			input.toLowerCase() === "q"
		)
			return onCancel();
	});
	return (
		<Box
			flexDirection="column"
			width="100%"
			height="100%"
			borderStyle="single"
			paddingX={1}
		>
			<Text bold color={preview.status === "valid" ? "green" : "yellow"}>
				V2 CELL PREVIEW
			</Text>
			<Text>cell: {preview.cellId}</Text>
			<Text>status: {preview.status}</Text>
			<Text>preview: {preview.previewId}</Text>
			<Text>fingerprint: {preview.planFingerprint || "(none)"}</Text>
			{preview.diagnostics.length === 0 ? (
				<Text color="gray">No diagnostics</Text>
			) : (
				<Box flexDirection="column">
					{preview.diagnostics.map((diagnostic, index) => (
						<Text key={index} color="yellow">
							{diagnostic}
						</Text>
					))}
				</Box>
			)}
			<Text color="gray">[A]ccept [E]dit [C]ancel</Text>
		</Box>
	);
}
