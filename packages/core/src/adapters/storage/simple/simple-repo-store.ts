import type { OwnerScope } from "../../../config/types";
import type { GenericSimpleEntityStore } from "./entity-store";

export class SimpleRepoStore<Session, Persistent> {
	constructor(private store: GenericSimpleEntityStore<Session, Persistent>) {}

	get(sessionId: string, id: string): Promise<Session | null>;
	get(id: string, scope: OwnerScope): Promise<Persistent | null>;
	async get(a: string, b: string | OwnerScope): Promise<any> {
		if (typeof b === "string") {
			const resolved = await this.getAlias(a, b);
			return this.store.getSession(a, resolved || b);
		}
		return this.store.getPersistent(a, b);
	}

	set(sessionId: string, id: string, state: Session): Promise<void>;
	set(id: string, state: Persistent, scope: OwnerScope): Promise<void>;
	async set(a: string, b: any, c?: any): Promise<void> {
		if (c && typeof c === "object" && "level" in c) {
			return this.store.setPersistent(a, b, c);
		} else {
			return this.store.setSession(a, b, c);
		}
	}

	delete(sessionId: string, id: string): Promise<void>;
	delete(id: string, scope: OwnerScope): Promise<void>;
	async delete(a: string, b: string | OwnerScope): Promise<void> {
		return typeof b === "string"
			? this.store.deleteSession(a, b)
			: this.store.deletePersistent(a, b);
	}

	create(sessionId: string, state: any, alias?: string): Promise<string> {
		return this.store.create(sessionId, state, alias);
	}

	getAlias(sessionId: string, alias: string): Promise<string | null> {
		return this.store.getAlias(sessionId, alias);
	}

	setAlias(sessionId: string, alias: string, targetId: string): Promise<void> {
		return this.store.setAlias(sessionId, alias, targetId);
	}

	deleteAlias(sessionId: string, alias: string): Promise<void> {
		return this.store.deleteAlias(sessionId, alias);
	}

	listAliases(
		sessionId: string,
	): Promise<Array<{ alias: string; targetId: string }>> {
		return this.store.listAliases(sessionId);
	}

	listSession(sessionId: string): Promise<string[]> {
		return this.store.listSession(sessionId);
	}

	listChildren(sessionId: string, parentId: string): Promise<string[]> {
		return this.store.listChildren(sessionId, parentId);
	}

	expireSession(sessionId: string, olderThanMs?: number): Promise<void> {
		return this.store.expireSession(sessionId, olderThanMs);
	}

	findByTag(tag: string, scope: OwnerScope): Promise<Persistent[]> {
		return this.store.findByTag(tag, scope);
	}

	list(
		scope: OwnerScope,
		includeGlobal?: boolean,
	): Promise<Array<Persistent & { scope: OwnerScope }>> {
		return this.store.list(scope, includeGlobal) as Promise<
			Array<Persistent & { scope: OwnerScope }>
		>;
	}
}
