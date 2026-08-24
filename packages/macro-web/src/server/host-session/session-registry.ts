import { SessionError } from "../session-error";
import type {
	Session,
	SessionDisposalController,
	SessionRegistryLike,
} from "./session-types";

/**
 * Owns the live session `Map` and the idle-eviction policy.
 *
 * The registry deliberately knows nothing about event emission, keymaps, or
 * file-tree watching. Disposal is delegated to an injected
 * `SessionDisposalController` so the synchronous (watcher/listener) and
 * asynchronous (workspace) cleanup steps can live in the lifecycle module
 * while the registry keeps a single, well-scoped responsibility.
 */
export class SessionRegistry implements SessionRegistryLike {
	private readonly sessions = new Map<string, Session>();
	private readonly idleTimeoutMs: number;
	private readonly disposal: SessionDisposalController;

	constructor(options: {
		readonly idleTimeoutMs: number;
		readonly disposal: SessionDisposalController;
	}) {
		this.idleTimeoutMs = options.idleTimeoutMs;
		this.disposal = options.disposal;
	}

	/**
	 * Return a live session, bumping its last-activity stamp on access. A
	 * disposed session is treated as missing so callers never observe stale
	 * state.
	 */
	get(sessionId: string): Session | undefined {
		const session = this.sessions.get(sessionId);
		if (session && !session.disposed) {
			session.lastActivity = Date.now();
			return session;
		}
		return undefined;
	}

	/** Same as {@link get} but throws a {@link SessionError} when absent. */
	getOrError(sessionId: string): Session {
		const session = this.get(sessionId);
		if (!session)
			throw new SessionError("SESSION_NOT_FOUND", "Session not found", false);
		return session;
	}

	has(sessionId: string): boolean {
		const session = this.sessions.get(sessionId);
		return !!session && !session.disposed;
	}

	register(session: Session): void {
		this.sessions.set(session.id, session);
	}

	delete(sessionId: string): void {
		this.sessions.delete(sessionId);
	}

	ids(): string[] {
		return [...this.sessions.keys()];
	}

	/** Tear down and dispose a single session; returns `false` if not present. */
	async dispose(sessionId: string): Promise<boolean> {
		const session = this.sessions.get(sessionId);
		if (!session) return false;
		session.disposed = true;
		this.disposal.teardown(session);
		this.sessions.delete(sessionId);
		await this.disposal.disposeResources(session);
		return true;
	}

	/** Evict every session whose last activity exceeds the idle timeout. */
	async disposeAbandoned(now: number = Date.now()): Promise<void> {
		for (const [id, session] of this.sessions) {
			if (now - session.lastActivity > this.idleTimeoutMs)
				await this.dispose(id);
		}
	}

	/** Tear down every session. */
	async disposeAll(): Promise<void> {
		for (const id of [...this.sessions.keys()]) await this.dispose(id);
	}
}
