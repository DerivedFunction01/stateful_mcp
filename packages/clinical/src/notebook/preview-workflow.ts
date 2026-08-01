import type { Cell } from "../session/cell";
import type {
	CellProcessor,
	CellProcessResult,
} from "../session/cell-processor";
import type { PreviewCandidate } from "../session/preview-candidate";
import { computeInputFingerprint } from "../session/preview-candidate";

export class PreviewWorkflow {
	static async createCandidate(
		cell: Cell,
		processor: Pick<CellProcessor, "preview">,
		sessionId: string,
	): Promise<{
		candidate?: PreviewCandidate;
		cellResult?: CellProcessResult;
		error?: string;
	}> {
		const clone = structuredClone(cell);
		const result = await processor.preview(clone);

		const previewError = result.error;
		if (previewError) {
			return { error: previewError.message ?? "preview failed" };
		}

		const fingerprint = computeInputFingerprint(
			cell.rawInput,
			cell.routing.targetSchema,
		);

		const candidate: PreviewCandidate = {
			candidateId: `preview_${cell.cellId}_${Date.now()}`,
			sessionId,
			cellId: cell.cellId,
			rawInput: cell.rawInput,
			inputFingerprint: fingerprint,
			profileFingerprint: "memory",
			parsedOutput: result.preview ?? null,
			warnings: [],
			diagnostics: [],
			status: 0 as any,
			createdAt: new Date().toISOString(),
		};

		return { candidate, cellResult: result };
	}

	static validateFingerprint(
		candidate: PreviewCandidate,
		cell: Cell,
	): { valid: boolean; error?: string } {
		const currentFingerprint = computeInputFingerprint(
			cell.rawInput,
			cell.routing.targetSchema,
		);
		if (currentFingerprint !== candidate.inputFingerprint) {
			return {
				valid: false,
				error: "preview stale — cell was edited since preview",
			};
		}
		return { valid: true };
	}

	static async commitCandidate(
		candidate: PreviewCandidate,
		cell: Cell,
		processor: Pick<CellProcessor, "execute">,
	): Promise<{ cell?: Cell; error?: string }> {
		const validation = PreviewWorkflow.validateFingerprint(candidate, cell);
		if (!validation.valid) return { error: validation.error };

		const result = await processor.execute(structuredClone(cell));
		if (result.error) {
			return { error: result.error.message ?? "execute failed" };
		}
		return { cell: result.cell };
	}
}
