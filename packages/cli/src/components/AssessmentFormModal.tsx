import { Box, Text } from "ink";
import { useState } from "react";

interface AssessmentFormModalProps {
	mode: "create_branch" | "add_evidence";
	activeBranchId?: string;
	onSubmitBranch: (name: string, conceptText: string) => Promise<void>;
	onSubmitEvidence?: (
		branchId: string,
		conceptText: string,
		isSupporting: boolean,
	) => Promise<void>;
	onClose: () => void;
}

export function AssessmentFormModal({
	mode,
	activeBranchId,
	onSubmitBranch,
	onSubmitEvidence,
	onClose,
}: AssessmentFormModalProps) {
	const [name, setName] = useState("");
	const [conceptText, setConceptText] = useState("");
	const [isSupporting, setIsSupporting] = useState(true);
	const [fieldIndex, setFieldIndex] = useState(0);

	return (
		<Box
			flexDirection="column"
			borderStyle="double"
			borderColor="cyan"
			padding={1}
			width={60}
		>
			<Text bold color="cyan">
				{mode === "create_branch"
					? "CREATE HYPOTHESIS BRANCH"
					: `ADD EVIDENCE (${activeBranchId})`}
			</Text>

			{mode === "create_branch" ? (
				<>
					<Box paddingTop={1}>
						<Text
							bold={fieldIndex === 0}
							color={fieldIndex === 0 ? "yellow" : undefined}
						>
							Branch Name: {name || "[Type name...]"}
						</Text>
					</Box>
					<Box paddingTop={1}>
						<Text
							bold={fieldIndex === 1}
							color={fieldIndex === 1 ? "yellow" : undefined}
						>
							Hypothesis Concept: {conceptText || "[Type concept term/code...]"}
						</Text>
					</Box>
				</>
			) : (
				<>
					<Box paddingTop={1}>
						<Text
							bold={fieldIndex === 0}
							color={fieldIndex === 0 ? "yellow" : undefined}
						>
							Evidence Concept: {conceptText || "[Type concept...]"}
						</Text>
					</Box>
					<Box paddingTop={1}>
						<Text
							bold={fieldIndex === 1}
							color={fieldIndex === 1 ? "yellow" : undefined}
						>
							Type: {isSupporting ? "[+] Supporting" : "[-] Refuting"} (Press
							Space to toggle)
						</Text>
					</Box>
				</>
			)}

			<Box paddingTop={1} justifyContent="space-between">
				<Text color="green">[ Enter: Submit ]</Text>
				<Text color="gray">[ Esc: Cancel ]</Text>
			</Box>
		</Box>
	);
}
