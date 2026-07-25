type Storage = any;

export const mockLocalStorage: Storage & { store: Map<string, string> } = {
	store: new Map<string, string>(),
	get length() {
		return this.store.size;
	},
	clear() {
		this.store.clear();
	},
	getItem(key: string) {
		return this.store.get(key) || null;
	},
	setItem(key: string, value: string) {
		this.store.set(key, value);
	},
	removeItem(key: string) {
		this.store.delete(key);
	},
	key(index: number) {
		return Array.from(this.store.keys())[index] || null;
	},
};

export const mockIndexedDBStore = new Map<string, Map<string, any>>();

function initStores() {
	for (const name of [
		"states",
		"aliases",
		"concepts",
		"namespaces",
		"expressions",
	]) {
		if (!mockIndexedDBStore.has(name)) {
			mockIndexedDBStore.set(name, new Map());
		}
	}
}

function objectStoreApi(storeMap: Map<string, any>) {
	return {
		get(key: string) {
			const req: any = {};
			setTimeout(() => {
				req.result = storeMap.get(key);
				if (req.onsuccess) req.onsuccess();
			}, 0);
			return req;
		},
		put(value: any, key: string) {
			const req: any = {};
			setTimeout(() => {
				storeMap.set(key, value);
				if (req.onsuccess) req.onsuccess();
			}, 0);
			return req;
		},
		delete(key: string) {
			const req: any = {};
			setTimeout(() => {
				storeMap.delete(key);
				if (req.onsuccess) req.onsuccess();
			}, 0);
			return req;
		},
		getAllKeys() {
			const req: any = {};
			setTimeout(() => {
				req.result = Array.from(storeMap.keys());
				if (req.onsuccess) req.onsuccess();
			}, 0);
			return req;
		},
		getAll() {
			const req: any = {};
			setTimeout(() => {
				req.result = Array.from(storeMap.values());
				if (req.onsuccess) req.onsuccess();
			}, 0);
			return req;
		},
		openCursor() {
			const req: any = {};
			const keys = Array.from(storeMap.keys());
			const values = Array.from(storeMap.values());
			let idx = 0;
			setTimeout(() => {
				const trigger = () => {
					if (idx < keys.length) {
						req.result = {
							key: keys[idx],
							value: values[idx],
							continue() {
								idx++;
								trigger();
							},
						};
						if (req.onsuccess)
							req.onsuccess({ target: { result: req.result } });
					} else {
						req.result = null;
						if (req.onsuccess) req.onsuccess({ target: { result: null } });
					}
				};
				trigger();
			}, 0);
			return req;
		},
	};
}
type IDBFactory = any;
export const mockIndexedDB: IDBFactory & {
	store: Map<string, Map<string, any>>;
} = {
	store: mockIndexedDBStore,
	open(_dbName: string, _version?: number) {
		initStores();
		const dbResult = {
			objectStoreNames: {
				contains(name: string) {
					return mockIndexedDBStore.has(name);
				},
			},
			createObjectStore(name: string) {
				if (!mockIndexedDBStore.has(name)) {
					mockIndexedDBStore.set(name, new Map());
				}
			},
			transaction(storeName: string, _mode: string) {
				const storeMap = mockIndexedDBStore.get(storeName)!;
				return {
					objectStore() {
						return objectStoreApi(storeMap);
					},
				};
			},
		};
		const request: any = { result: dbResult };
		setTimeout(() => {
			if (request.onsuccess) request.onsuccess();
		}, 0);
		return request;
	},
	// IDBFactory stubs for unimplemented methods
	cmp() {
		throw new Error("not implemented");
	},
	deleteDatabase() {
		throw new Error("not implemented");
	},
	databases() {
		throw new Error("not implemented");
	},
};

export function installBrowserMocks(): void {
	(globalThis as any).window = {
		localStorage: mockLocalStorage,
		indexedDB: mockIndexedDB,
	};
}

export function clearMockLocalStorage(): void {
	mockLocalStorage.store.clear();
}

export function clearMockIndexedDB(...stores: string[]): void {
	for (const name of stores) {
		const store = mockIndexedDBStore.get(name);
		if (store) store.clear();
	}
}
