import type {
	ValueRequestDto,
	ValueSampleResultDto,
} from "@stateful-mcp/macro-protocol";
import type { SandboxSampleRow, ValueAuthoringWizardState } from "../state";
import { hasMalformedSyntaxFailure } from "../steps";

/**
 * Sandbox step: sample rows and a semantic request builder, with run/stale
 * handling. Previews never persist; invalid graphs may still be inspected,
 * but preview runs are rejected client-side before any transport call.
 */
export const SANDBOX_REJECT_CODE = "GRAPH_INVALID_PREVIEW_REJECTED";
export const SANDBOX_REJECT_REASON_KEY = "settings.preview.diagnostic";

export function normalizeSampleRows(
	rows: readonly SandboxSampleRow[],
): readonly SandboxSampleRow[] {
	return rows
		.map((row) => ({
			input: typeof row.input === "string" ? row.input.trim() : "",
			argumentId:
				typeof row.argumentId === "string" && row.argumentId.trim()
					? row.argumentId.trim()
					: undefined,
		}))
		.filter((row) => row.input.length > 0);
}

export function normalizeSandboxRequest(
	request: ValueRequestDto | null,
): ValueRequestDto | null {
	if (!request || typeof request.valueKind !== "string") return null;
	const valueKind = request.valueKind.trim();
	if (!valueKind) return null;
	return {
		valueKind,
		requiredFields: (request.requiredFields ?? []).map((field) => field.trim()),
		allowAdditionalFields: request.allowAdditionalFields ?? false,
	};
}

/** Whether the current draft compiles enough for transport previews. */
export function canRunSandboxPreview(
	state: Pick<ValueAuthoringWizardState, "validation">,
): boolean {
	if (hasMalformedSyntaxFailure(state.validation.diagnostics)) return false;
	if (state.validation.status === "settled" && state.validation.valid === false)
		return false;
	return true;
}

export interface ProjectedSampleResult {
	readonly input: string;
	readonly argumentId: string | null;
	/** Selected candidate: matched recipe presentation state. */
	readonly matched: boolean;
	readonly recipeId: string | null;
	readonly canonicalValue: unknown;
	readonly displayValue: string | null;
	/** Rejected candidates surfaced alongside the selected one. */
	readonly rejected: readonly {
		recipeId: string;
		reason: string;
	}[];
	readonly diagnostics: ValueSampleResultDto["diagnostics"];
}

export function projectSampleResult(
	result: ValueSampleResultDto,
): ProjectedSampleResult {
	return {
		input: result.input,
		argumentId: result.argumentId ?? null,
		matched: result.matched,
		recipeId: result.recipeId ?? null,
		canonicalValue: result.canonicalValue ?? null,
		displayValue: result.displayValue ?? null,
		rejected: (result.rejected ?? []).map((candidate) => ({
			recipeId: candidate.recipeId,
			reason: candidate.reason,
		})),
		diagnostics: result.diagnostics,
	};
}
