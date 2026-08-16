import type { ExpressionBackend } from "../contracts/backends";
import type { MacroCandidateSnapshot } from "../contracts/composition";
import type { MacroRuntimeContext } from "../contracts/context";
import type {
	CreateMacroDraftSessionOptions,
	MacroDraftInputs,
	MacroDraftSession as MacroDraftSessionContract,
	MacroDraftSnapshot,
} from "../contracts/draft";
import type { MacroSpec } from "../contracts/macro";
import type { MacroArgumentMatch } from "../contracts/matching";
import type { MacroParseResult } from "../contracts/payload";
import type {
	AcceptedMacroLock,
	CandidateResolution,
	MacroDraftDiagnostic,
	MacroTextEdit,
} from "../contracts/slots";
import {
	type ParseMacroLineResult,
	parseMacroLine,
} from "../parser/macro-parser";
import { skipWhitespace, uniqueMatches } from "../parser/macro-scanner";
import { compileMacroPayload } from "../payload/payload-compiler";
import {
	activeMacroSlot,
	applyMacroLocks,
	projectMacroSlots,
	shiftMacroLocksForDeletion,
	shiftMacroLocksForInsertion,
} from "../slots/macro-slots";

export class MacroDraftSession implements MacroDraftSessionContract {
	private spec: MacroSpec;
	private context: MacroRuntimeContext;
	private backends: Readonly<Record<string, ExpressionBackend>>;
	private candidateSnapshots: readonly MacroCandidateSnapshot[];
	private text: string;
	private cursorOffset: number;
	private revision = 0;
	private locks: AcceptedMacroLock[];
	private current: MacroDraftSnapshot;

	constructor(options: CreateMacroDraftSessionOptions) {
		this.spec = options.spec;
		this.context = options.context;
		this.backends = options.backends ?? {};
		this.candidateSnapshots = options.candidateSnapshots ?? [];
		this.text = options.initialText ?? "";
		this.cursorOffset = clamp(
			options.initialCursor ?? this.text.length,
			0,
			this.text.length,
		);
		this.locks = [...(options.locks ?? [])];
		this.current = this.recompute([]);
	}

	replaceInputs(inputs: MacroDraftInputs): MacroDraftSnapshot {
		this.spec = inputs.spec;
		this.context = inputs.context;
		this.backends = inputs.backends ?? {};
		this.candidateSnapshots = inputs.candidateSnapshots ?? [];
		const diagnostics: MacroDraftDiagnostic[] = [];
		this.locks = this.locks.filter((lock) => {
			if (
				lock.macroId !== this.spec.id ||
				lock.macroVersion !== (this.spec.version ?? 1)
			) {
				diagnostics.push(staleLockDiagnostic(lock));
				return false;
			}
			if (lock.backendVersion && lock.candidateId) {
				const version = this.versionForLock(lock);
				if (version && version !== lock.backendVersion) {
					diagnostics.push(staleLockDiagnostic(lock));
					return false;
				}
			}
			return true;
		});
		this.current = this.recompute(diagnostics);
		return this.snapshot();
	}

	setText(text: string, cursorOffset = text.length): MacroDraftSnapshot {
		if (text !== this.text) {
			this.revision += 1;
			this.locks = [];
		}
		this.text = text;
		this.cursorOffset = clamp(cursorOffset, 0, text.length);
		this.current = this.recompute([]);
		return this.snapshot();
	}

	applyEdit(edit: MacroTextEdit): MacroDraftSnapshot {
		const start = clamp(edit.start, 0, this.text.length);
		const end = clamp(edit.end, start, this.text.length);
		const deleted = end - start;
		const inserted = edit.text.length;
		let nextLocks = this.locks;
		if (deleted) nextLocks = shiftMacroLocksForDeletion(nextLocks, start, end);
		if (inserted) {
			nextLocks = shiftMacroLocksForInsertion(nextLocks, start, inserted);
		}
		this.text = this.text.slice(0, start) + edit.text + this.text.slice(end);
		this.cursorOffset = clamp(start + inserted, 0, this.text.length);
		this.revision += 1;
		this.locks = nextLocks;
		this.current = this.recompute([]);
		return this.snapshot();
	}

	acceptCandidate(argumentId: string, occurrence = 0): MacroDraftSnapshot {
		const resolution = this.current.resolutions.find(
			(item) =>
				item.argumentId === argumentId &&
				item.occurrence === occurrence &&
				item.match,
		);
		const match =
			resolution?.match ??
			this.current.parse?.matches.find(
				(item) =>
					item.argumentId === argumentId &&
					(item.occurrence ?? 0) === occurrence,
			);
		if (!match || match.extraction.end <= match.extraction.start) {
			this.current = this.recompute([
				invalidAcceptanceDiagnostic(argumentId, occurrence),
			]);
			return this.snapshot();
		}
		const lock = this.lockForMatch(match, "explicit");
		this.locks = this.locks.filter(
			(item) =>
				item.argumentId !== argumentId || item.occurrence !== occurrence,
		);
		this.locks.push(lock);
		this.current = this.recompute([]);
		return this.snapshot();
	}

	unlockCandidate(argumentId: string, occurrence = 0): MacroDraftSnapshot {
		this.locks = this.locks.filter(
			(item) =>
				item.argumentId !== argumentId || item.occurrence !== occurrence,
		);
		this.current = this.recompute([]);
		return this.snapshot();
	}

	snapshot(): MacroDraftSnapshot {
		return {
			...this.current,
			resolutions: [...this.current.resolutions],
			projections: [...this.current.projections],
			locks: [...this.current.locks],
			diagnostics: [...this.current.diagnostics],
		};
	}

	commit(): MacroParseResult {
		const result = compileMacroPayload(this.spec, this.text, {
			context: this.context,
			backends: this.backends,
			candidateSnapshots: this.candidateSnapshots,
			mode: "execute",
			acceptedLocks: this.locks,
		});
		if (result.status !== "invalid") {
			const parsed = parseMacroLine(this.text, this.spec, {
				context: this.context,
				backends: this.backends,
				candidateSnapshots: this.candidateSnapshots,
				mode: "execute",
			});
			for (const match of parsed?.matches ?? []) {
				if (
					match.source === "default" ||
					match.extraction.end <= match.extraction.start
				) {
					continue;
				}
				const lock = this.lockForMatch(match, "accepted");
				if (!this.locks.some((item) => item.lockId === lock.lockId)) {
					this.locks.push(lock);
				}
			}
			this.current = this.recompute([]);
			return compileMacroPayload(this.spec, this.text, {
				context: this.context,
				backends: this.backends,
				candidateSnapshots: this.candidateSnapshots,
				mode: "execute",
				acceptedLocks: this.locks,
			});
		}
		return result;
	}

	private recompute(
		extraDiagnostics: MacroDraftDiagnostic[],
	): MacroDraftSnapshot {
		this.locks = this.locks.filter((lock) => {
			if (
				lock.macroId !== this.spec.id ||
				lock.macroVersion !== (this.spec.version ?? 1) ||
				this.text.slice(lock.start, lock.end) !== lock.rawText
			) {
				extraDiagnostics.push(staleLockDiagnostic(lock));
				return false;
			}
			const version = this.versionForLock(lock);
			if (lock.backendVersion && version && lock.backendVersion !== version) {
				extraDiagnostics.push(staleLockDiagnostic(lock));
				return false;
			}
			return true;
		});

		const parsed = parseMacroLine(this.text, this.spec, {
			context: this.context,
			backends: this.backends,
			candidateSnapshots: this.candidateSnapshots,
			mode: "live",
		});

		if (!parsed) {
			return {
				mode: "idle",
				text: this.text,
				revision: this.revision,
				cursorOffset: this.cursorOffset,
				parse: null,
				resolutions: [],
				projections: [],
				locks: [...this.locks],
				diagnostics: [...extraDiagnostics],
			};
		}

		const resolutions = resolveCandidates(parsed, this.text, this.spec);
		const diagnostics: MacroDraftDiagnostic[] = [
			...parsed.diagnostics,
			...extraDiagnostics,
			...resolutions
				.filter((item) => item.disposition === "unstable")
				.map((item) => ({
					code: "UNSTABLE_CANDIDATE" as const,
					argumentId: item.argumentId,
					message: "Candidate is visible but not accepted during live preview",
				})),
		];

		const rawProjections = projectMacroSlots(this.text, this.spec, {
			context: this.context,
			backends: this.backends,
			candidateSnapshots: this.candidateSnapshots,
			mode: "live",
		});

		// Map resolutions into projection status
		const adjustedProjections = rawProjections.map((proj) => {
			const resolution = resolutions.find(
				(res) =>
					res.argumentId === proj.argumentId &&
					(res.occurrence ?? 0) === (proj.occurrence ?? 0),
			);
			if (resolution && resolution.disposition === "unstable") {
				return { ...proj, status: "pending" as const };
			}
			return proj;
		});

		const projections = applyMacroLocks(
			adjustedProjections,
			this.locks,
			undefined,
			this.text,
		);

		const payloadPreview = compileMacroPayload(this.spec, this.text, {
			context: this.context,
			backends: this.backends,
			candidateSnapshots: this.candidateSnapshots,
			mode: "live",
			acceptedLocks: this.locks,
		});

		for (const resolution of resolutions) {
			if (resolution.disposition !== "unstable") continue;
			if (
				this.locks.some(
					(lock) =>
						lock.argumentId === resolution.argumentId &&
						lock.occurrence === resolution.occurrence,
				)
			) {
				continue;
			}
			const result = payloadPreview.arguments.find(
				(item) => item.argumentId === resolution.argumentId,
			);
			if (result && result.state === "locked") {
				result.state = "pending";
			}
		}

		const active = activeMacroSlot(projections, this.cursorOffset);
		return {
			mode: "macro",
			text: this.text,
			revision: this.revision,
			cursorOffset: this.cursorOffset,
			parse: parsed,
			payloadPreview,
			resolutions,
			projections,
			locks: [...this.locks],
			diagnostics,
			activeArgumentId: active?.argumentId,
		};
	}

	private lockForMatch(
		match: MacroArgumentMatch,
		source: AcceptedMacroLock["source"],
	): AcceptedMacroLock {
		const argument = this.spec.arguments.find(
			(item) => item.argumentId === match.argumentId,
		);
		const backend = match.backendId
			? this.backends[match.backendId]
			: undefined;
		const occurrence = match.occurrence ?? 0;
		const identity =
			match.sourceId ?? match.formId ?? `${match.source}:${match.rawValue}`;
		return {
			lockId: `${this.spec.id}:${this.spec.version ?? 1}:${match.argumentId}:${occurrence}:${identity}`,
			macroId: this.spec.id,
			macroVersion: this.spec.version ?? 1,
			argumentId: match.argumentId,
			occurrence,
			start: match.extraction.start,
			end: match.extraction.end,
			rawText: this.text.slice(match.extraction.start, match.extraction.end),
			candidateId: match.sourceId,
			binding: {
				backendId: match.backendId,
				candidateId: match.sourceId,
				displayValue: match.rawValue,
				canonicalValue: match.canonicalValue,
				metadata:
					match.metadata ??
					(argument ? { argumentName: argument.name } : undefined),
			},
			source,
			acceptedAtRevision: this.revision,
			backendVersion:
				match.resolverVersion ?? backend?.backendVersion ?? backend?.version,
		};
	}

	private versionForLock(lock: AcceptedMacroLock): string | undefined {
		if (lock.binding?.backendId) {
			const backend = this.backends[lock.binding.backendId];
			if (backend) return backend.backendVersion ?? backend.version;
			const snapshot = this.candidateSnapshots.find(
				(item) =>
					item.resolverId === lock.binding?.backendId &&
					item.argumentId === lock.argumentId,
			);
			if (snapshot) return snapshot.version;
		}
		const match = this.current?.parse?.matches.find(
			(item) =>
				item.argumentId === lock.argumentId &&
				item.sourceId === lock.candidateId,
		);
		if (match?.backendId) {
			const backend = this.backends[match.backendId];
			if (backend) return backend.backendVersion ?? backend.version;
		}
		const snapshot = this.candidateSnapshots.find(
			(item) => item.argumentId === lock.argumentId,
		);
		if (snapshot) return snapshot.version;
		return Object.values(this.backends)
			.map((backend) => backend.backendVersion ?? backend.version)
			.find((v) => v === lock.backendVersion);
	}
}

function resolveCandidates(
	parsed: ParseMacroLineResult,
	text: string,
	spec: MacroSpec,
): CandidateResolution[] {
	const candidates = uniqueMatches(parsed.candidates ?? parsed.matches);
	const selected = parsed.matches;
	const result: CandidateResolution[] = [];

	for (const match of selected) {
		const occurrence = match.occurrence ?? 0;
		const sameSpan = candidates.filter(
			(item) =>
				item.argumentId === match.argumentId &&
				(item.occurrence ?? 0) === occurrence &&
				item.extraction.start === match.extraction.start &&
				item.extraction.end === match.extraction.end,
		);
		const longerContinuation =
			match.matchKind === "prefix" ||
			sameSpan.some(
				(item) => !sameMatch(item, match) && item.matchKind === "prefix",
			);
		const unmatchedContinuation =
			match.source === "expression" &&
			match.rawValue.trim().includes(" ") &&
			isUnmatchedTrailingText(text, match, selected);
		const unresolvedAlternatives = sameSpan.filter(
			(item) =>
				item.sourceId !== match.sourceId && item.matchKind === match.matchKind,
		);
		const disposition =
			longerContinuation || unmatchedContinuation
				? "unstable"
				: unresolvedAlternatives.length > 0
					? "ambiguous"
					: "selected";
		result.push({
			argumentId: match.argumentId,
			occurrence,
			match,
			disposition,
			livePending: disposition === "unstable",
			reason: disposition === "unstable" ? "longer-continuation" : undefined,
		});
	}

	for (const argument of spec.arguments) {
		if (!result.some((item) => item.argumentId === argument.argumentId)) {
			result.push({
				argumentId: argument.argumentId,
				occurrence: 0,
				disposition: "none",
			});
		}
	}

	return result.sort(
		(left, right) =>
			(left.match?.extraction.start ?? Number.MAX_SAFE_INTEGER) -
			(right.match?.extraction.start ?? Number.MAX_SAFE_INTEGER),
	);
}

function isUnmatchedTrailingText(
	text: string,
	match: MacroArgumentMatch,
	selected: readonly MacroArgumentMatch[],
): boolean {
	const trailingStart = skipWhitespace(text, match.extraction.end);
	if (trailingStart >= text.length) return false;
	return !selected.some(
		(candidate) =>
			candidate !== match &&
			candidate.extraction.start <= trailingStart &&
			candidate.extraction.end > trailingStart,
	);
}

function sameMatch(
	left: MacroArgumentMatch,
	right: MacroArgumentMatch,
): boolean {
	return (
		left.argumentId === right.argumentId &&
		(left.occurrence ?? 0) === (right.occurrence ?? 0) &&
		left.extraction.start === right.extraction.start &&
		left.extraction.end === right.extraction.end &&
		left.source === right.source &&
		left.sourceId === right.sourceId &&
		left.formId === right.formId
	);
}

function clamp(value: number, min: number, max: number): number {
	return Math.max(min, Math.min(value, max));
}

function staleLockDiagnostic(lock: AcceptedMacroLock): MacroDraftDiagnostic {
	return {
		code: "STALE_LOCK",
		message: `Accepted lock '${lock.lockId}' is stale and was discarded`,
		argumentId: lock.argumentId,
		start: lock.start,
		end: lock.end,
	};
}

function invalidAcceptanceDiagnostic(
	argumentId: string,
	occurrence: number,
): MacroDraftDiagnostic {
	return {
		code: "INVALID_ACCEPTANCE",
		message: `No live candidate exists for '${argumentId}' occurrence ${occurrence}`,
		argumentId,
	};
}

export type { MacroDraftSnapshot };
