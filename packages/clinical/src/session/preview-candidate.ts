import type { ParsedItem } from "../parser/schema-parsers";
import type { Cell } from "./cell";
import type { CellProcessResult } from "./cell-processor";
import type { ParseDiagnostic, ParseTrace } from "./parse-trace";

export enum CandidateStatus {
	Active = "active",
	Committed = "committed",
	Cancelled = "cancelled",
	Expired = "expired",
}

export interface PreviewWarning {
	code: string;
	messageKey: string;
	fieldPath?: string;
	details?: Record<string, unknown>;
}

export interface PreviewCandidate {
	candidateId: string;
	sessionId: string;
	cellId: string;
	rawInput: string;
	inputFingerprint: string;
	profileFingerprint: string;
	parsedOutput: ParsedItem[] | null;
	warnings: PreviewWarning[];
	diagnostics: ParseDiagnostic[];
	status: CandidateStatus;
	createdAt: string;
	expiresAt?: string;
	trace?: ParseTrace;
}

export interface CandidateStore {
	save(candidate: PreviewCandidate): Promise<void>;
	get(candidateId: string): Promise<PreviewCandidate | null>;
	list(sessionId: string): Promise<PreviewCandidate[]>;
	delete(candidateId: string): Promise<void>;
}

/** Compute a fingerprint for preview invalidation. */
export function computeInputFingerprint(
	rawInput: string,
	routingSchema: string | null | undefined,
): string {
	const normalized = rawInput.trim().toLowerCase().replace(/\s+/g, " ");
	return `${routingSchema ?? ""}::${normalized}`;
}

export function computeProfileFingerprint(
	profileId: string,
	version?: string,
): string {
	return version ? `${profileId}@${version}` : profileId;
}

export interface CommitPreviewResult {
	success: boolean;
	cell?: Cell;
	cellResult?: CellProcessResult;
	error?: { code: string; message?: string };
}
