export type ScheduledFn = () => void;

/** Handle for a scheduled callback; cancel must be idempotent. */
export interface ScheduledCall {
	cancel(): void;
}

/**
 * Injected scheduling primitive. The wizard model never creates real timers;
 * tests use `immediateSchedule` so Bun suites stay synchronous-safe.
 */
export type ScheduleFn = (fn: ScheduledFn, delayMs: number) => ScheduledCall;

/** Runs callbacks synchronously; debounce windows collapse to zero delay. */
export const immediateSchedule: ScheduleFn = (fn) => {
	fn();
	return { cancel: () => {} };
};

/** Real timer scheduling used by the Phase 4 browser adapter. */
export const timeoutSchedule: ScheduleFn = (fn, delayMs) => {
	const handle = setTimeout(fn, Math.max(0, delayMs));
	return {
		cancel: () => {
			clearTimeout(handle);
		},
	};
};

/**
 * Per-key debounce window. Triggering again before the window elapses
 * cancels the pending call and reschedules it.
 */
export class Debouncer {
	constructor(
		private readonly schedule: ScheduleFn,
		private readonly windowMs: number,
	) {}

	private readonly pending = new Map<string, ScheduledCall>();

	trigger(key: string, fn: ScheduledFn): void {
		this.pending.get(key)?.cancel();
		this.pending.set(
			key,
			this.schedule(() => {
				this.pending.delete(key);
				fn();
			}, this.windowMs),
		);
	}

	isPending(key?: string): boolean {
		if (key !== undefined) return this.pending.has(key);
		return this.pending.size > 0;
	}

	cancel(key?: string): void {
		const keys = key === undefined ? [...this.pending.keys()] : [key];
		for (const candidate of keys) {
			this.pending.get(candidate)?.cancel();
			this.pending.delete(candidate);
		}
	}
}

/**
 * Monotonic versioned-request core. Every issued token supersedes all
 * earlier ones in its channel; late responses whose token is not current
 * are dropped as stale.
 */
export class VersionedRequestTracker {
	private lastIssued = 0;

	issue(): number {
		this.lastIssued += 1;
		return this.lastIssued;
	}

	isCurrent(token: number): boolean {
		return token === this.lastIssued;
	}
}

export const DEFAULT_WIZARD_DEBOUNCE_MS = 250;
