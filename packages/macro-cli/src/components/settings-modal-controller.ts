import type {
	EnumOptionDefinition,
	OpenSettingsRequest,
	SettingsNavigationState,
	SettingsUiModel,
	WindowLayoutStateManager,
	WorkspaceInputEvent,
	WorkspaceInputResult,
} from "@stateful-mcp/macro";

export type SettingsModalFocus =
	| "search"
	| "profile"
	| "scope"
	| "categories"
	| "content"
	| "json"
	| "actions";
export type SettingsModalDialog = "discard" | null;

export interface SettingsModalSnapshot {
	readonly open: boolean;
	readonly focus: SettingsModalFocus;
	readonly selectedCategoryIndex: number;
	readonly selectedItemIndex: number;
	readonly dialog: SettingsModalDialog;
	readonly scrollOffset: number;
	readonly jsonCursor: number;
}

export class SettingsModalController {
	private focus: SettingsModalFocus = "content";
	private selectedCategoryIndex = 0;
	private selectedItemIndex = 0;
	private scrollOffset = 0;
	private dialog: SettingsModalDialog = null;
	private jsonCursor = 0;
	private readonly listeners = new Set<() => void>();

	constructor(
		readonly model: SettingsUiModel,
		private readonly layout: WindowLayoutStateManager,
		private readonly navigation?: SettingsNavigationState,
	) {}

	getSnapshot(): SettingsModalSnapshot {
		return {
			open: this.layout.getSnapshot().activeModal?.id === "settings",
			focus: this.focus,
			dialog: this.dialog,
			scrollOffset: this.scrollOffset,
			jsonCursor: this.jsonCursor,
			selectedCategoryIndex: this.selectedCategoryIndex,
			selectedItemIndex: this.selectedItemIndex,
		};
	}

	open(request: OpenSettingsRequest = {}, syncNavigation = true): void {
		const sections = this.model.getSnapshot().sections;
		const requested =
			request.section && request.section !== "all"
				? sections.findIndex((section) => section.id === request.section)
				: -1;
		if (requested >= 0) this.selectedCategoryIndex = requested;
		this.focus = "content";
		this.selectedItemIndex = 0;
		this.dialog = null;
		this.scrollOffset = 0;
		this.jsonCursor = this.model.getSnapshot().rawJsonText.length;
		if (this.layout.getSnapshot().activeModal?.id !== "settings") {
			this.layout.openModal({ id: "settings", title: "settings.title" });
		}
		if (syncNavigation) this.syncNavigation();
		this.notify();
	}

	close(): void {
		if (this.layout.getSnapshot().activeModal?.id === "settings") {
			this.layout.closeModal();
			this.notify();
		}
	}

	requestClose(): boolean {
		if (this.dialog) return true;
		if (
			this.model.getSnapshot().totalModifiedCount > 0 ||
			this.model.getSnapshot().hasErrors
		) {
			this.dialog = "discard";
			this.notify();
			return true;
		}
		this.close();
		return true;
	}

	confirmClose(action: "save" | "discard" | "cancel"): void {
		if (action === "cancel") {
			this.dialog = null;
			this.notify();
			return;
		}
		if (action === "discard") {
			this.dialog = null;
			this.close();
			return;
		}
		void this.save().then(() => {
			if (!this.model.getSnapshot().hasErrors) {
				this.dialog = null;
				this.close();
			} else {
				this.dialog = null;
				this.notify();
			}
		});
	}

	toggle(request?: OpenSettingsRequest): void {
		if (this.layout.getSnapshot().activeModal?.id === "settings") this.close();
		else this.open(request);
	}

	setFocus(focus: SettingsModalFocus): void {
		this.focus = focus;
		this.notify();
	}

	focusNext(direction: 1 | -1 = 1): void {
		const order: SettingsModalFocus[] = [
			"search",
			"profile",
			"scope",
			"content",
			"json",
			"actions",
		];
		const current = order.indexOf(this.focus);
		this.focus =
			order[(current + direction + order.length) % order.length] ?? "content";
		this.notify();
	}

	previousSection(): void {
		this.navigateCategory(-1);
	}

	nextSection(): void {
		this.navigateCategory(1);
	}

	private navigateCategory(delta: 1 | -1): void {
		const sections = this.model.getSnapshot().sections;
		if (sections.length === 0) return;
		this.selectedCategoryIndex =
			(this.selectedCategoryIndex + delta + sections.length) % sections.length;
		this.selectedItemIndex = 0;
		this.scrollOffset = 0;
		this.syncNavigation();
		this.notify();
	}

	pageScroll(delta: 1 | -1): void {
		const count =
			this.model.getSnapshot().sections[this.selectedCategoryIndex]?.items
				.length ?? 0;
		this.scrollOffset = Math.max(
			0,
			Math.min(Math.max(0, count - 1), this.scrollOffset + delta * 5),
		);
		this.selectedItemIndex = Math.max(
			0,
			Math.min(Math.max(0, count - 1), this.scrollOffset),
		);
		this.notify();
	}

	navigate(delta: 1 | -1): void {
		const snapshot = this.model.getSnapshot();
		if (this.focus === "profile") {
			const profiles = snapshot.availableProfiles ?? [];
			if (profiles.length > 0) {
				const current = Math.max(0, profiles.indexOf(snapshot.activeProfileId));
				const next =
					profiles[(current + delta + profiles.length) % profiles.length];
				if (next) void this.model.switchProfile(next);
			}
			this.notify();
			return;
		}
		if (this.focus === "scope") {
			const scopes = ["user", "workspace", "folder"] as const;
			const current = scopes.indexOf(snapshot.activeScope);
			this.model.setActiveScope(
				scopes[(current + delta + scopes.length) % scopes.length]!,
			);
			this.notify();
			return;
		}
		if (this.focus === "categories") {
			if (snapshot.sections.length > 0) {
				this.selectedCategoryIndex =
					(this.selectedCategoryIndex + delta + snapshot.sections.length) %
					snapshot.sections.length;
				this.selectedItemIndex = 0;
				this.syncNavigation();
			}
		} else if (this.focus === "content") {
			const section = snapshot.sections[this.selectedCategoryIndex];
			const itemCount = section?.items.length ?? 0;
			if (itemCount > 0)
				this.selectedItemIndex =
					(this.selectedItemIndex + delta + itemCount) % itemCount;
		}
		this.notify();
	}

	select(): void {
		if (this.focus === "profile" || this.focus === "scope") {
			this.navigate(1);
			return;
		}
		if (this.focus === "categories") {
			this.focus = "content";
			this.notify();
			return;
		}
		if (this.focus === "actions") {
			this.confirmClose("save");
			return;
		}
		if (this.focus !== "content") return;
		const section =
			this.model.getSnapshot().sections[this.selectedCategoryIndex];
		const item = section?.items[this.selectedItemIndex];
		if (!item) return;
		if (item.schema.type === "boolean") {
			this.model.setValue(item.schema.path, !item.effectiveValue);
		} else if (item.schema.type === "enum") {
			const options =
				item.schema.enumOptions ??
				item.schema.enumValues?.map((id) => ({ id, label: id }));
			if (options && options.length > 0) {
				const current = options.findIndex(
					(option: EnumOptionDefinition) => option.id === item.effectiveValue,
				);
				const next = options[(current + 1) % options.length];
				if (next) this.model.setValue(item.schema.path, next.id);
			}
		}
	}

	async save(): Promise<void> {
		await this.model.save();
	}

	handleCommand(command: string): WorkspaceInputResult {
		switch (command) {
			case "settings.navigateDown":
				this.navigate(1);
				return "handled";
			case "settings.navigateUp":
				this.navigate(-1);
				return "handled";
			case "settings.focusNavigation":
				this.setFocus("categories");
				return "handled";
			case "settings.focusContent":
				this.setFocus("content");
				return "handled";
			case "settings.focusSearch":
				this.setFocus("search");
				return "handled";
			case "settings.focusNext":
				this.focusNext(1);
				return "handled";
			case "settings.focusPrevious":
				this.focusNext(-1);
				return "handled";
			case "settings.selectEntry":
				this.select();
				return "handled";
			case "settings.save":
				return "handled";
			case "settings.back":
				this.requestClose();
				return "handled";
			case "settings.nextSection":
				this.nextSection();
				return "handled";
			case "settings.previousSection":
				this.previousSection();
				return "handled";
			default:
				return "ignored";
		}
	}

	setSearchQuery(query: string): void {
		this.model.setSearchQuery(query);
		this.selectedCategoryIndex = 0;
		this.selectedItemIndex = 0;
		this.syncNavigation();
		this.notify();
	}

	private syncNavigation(): void {
		const section =
			this.model.getSnapshot().sections[this.selectedCategoryIndex];
		if (section) {
			this.model.setActiveSection(section.id);
			this.navigation?.open({ section: section.id });
		}
	}

	handleInput(event: WorkspaceInputEvent): WorkspaceInputResult {
		if (event.type === "wheel") {
			this.navigate((event.delta ?? 1) > 0 ? 1 : -1);
			return "handled";
		}
		if (event.type === "pointer" && event.action === "press") {
			if ((event.x ?? 0) < 30) this.setFocus("categories");
			else this.setFocus("content");
			return "handled";
		}
		if (event.type !== "key") return "ignored";
		const key = (event.key ?? event.input ?? "").toLowerCase();
		if (this.dialog === "discard") {
			if (key === "escape" || key === "c") this.confirmClose("cancel");
			else if (key === "d") this.confirmClose("discard");
			else if (key === "s" || key === "enter" || key === "return")
				this.confirmClose("save");
			return "handled";
		}
		if (key === "tab") {
			this.focusNext(event.shift ? -1 : 1);
			return "handled";
		}
		if (key === "pageup") {
			this.pageScroll(-1);
			return "handled";
		}
		if (key === "pagedown") {
			this.pageScroll(1);
			return "handled";
		}
		if (this.focus === "json") {
			const raw = this.model.getSnapshot().rawJsonText;
			if (key === "escape" || key === "tab") {
				this.setFocus("content");
				return "handled";
			}
			if (key === "left") {
				this.jsonCursor = Math.max(0, this.jsonCursor - 1);
				this.notify();
				return "handled";
			}
			if (key === "right") {
				this.jsonCursor = Math.min(raw.length, this.jsonCursor + 1);
				this.notify();
				return "handled";
			}
			if (key === "home") {
				this.jsonCursor = raw.lastIndexOf("\n", this.jsonCursor - 1) + 1;
				this.notify();
				return "handled";
			}
			if (key === "end") {
				const lineEnd = raw.indexOf("\n", this.jsonCursor);
				this.jsonCursor = lineEnd < 0 ? raw.length : lineEnd;
				this.notify();
				return "handled";
			}
			if (key === "backspace" || key === "\b" || key === "\x7f") {
				if (this.jsonCursor > 0) {
					this.model.replaceRawJson(
						raw.slice(0, this.jsonCursor - 1) + raw.slice(this.jsonCursor),
					);
					this.jsonCursor--;
				}
				this.notify();
				return "handled";
			}
			if (key === "delete") {
				this.model.replaceRawJson(
					raw.slice(0, this.jsonCursor) + raw.slice(this.jsonCursor + 1),
				);
				this.notify();
				return "handled";
			}
			if (key === "enter" || key === "return") {
				this.model.replaceRawJson(
					raw.slice(0, this.jsonCursor) + "\n" + raw.slice(this.jsonCursor),
				);
				this.jsonCursor++;
				this.notify();
				return "handled";
			}
			if (
				event.input &&
				!event.ctrl &&
				!event.meta &&
				event.input.length === 1
			) {
				this.model.replaceRawJson(
					raw.slice(0, this.jsonCursor) +
						event.input +
						raw.slice(this.jsonCursor),
				);
				this.jsonCursor += event.input.length;
				this.notify();
			}
			return "handled";
		}
		if (this.focus === "search") {
			if (key === "escape") {
				this.setFocus("content");
				return "handled";
			}
			if (key === "enter" || key === "return" || key === "tab") {
				this.setFocus("content");
				return "handled";
			}
			if (key === "backspace" || key === "\b" || key === "\x7f") {
				this.setSearchQuery(this.model.getSearchQuery().slice(0, -1));
				return "handled";
			}
			if (
				event.input &&
				!event.ctrl &&
				!event.meta &&
				event.input.length === 1
			) {
				this.setSearchQuery(this.model.getSearchQuery() + event.input);
			}
			return "handled";
		}
		if (key === "j" || key === "down") {
			this.navigate(1);
			return "handled";
		}
		if (key === "k" || key === "up") {
			this.navigate(-1);
			return "handled";
		}
		if (key === "h" || key === "left") {
			this.setFocus(this.focus === "categories" ? "categories" : "content");
			return "handled";
		}
		if (key === "l" || key === "right") {
			this.setFocus("content");
			return "handled";
		}
		if (key === "/") {
			this.setFocus("search");
			return "handled";
		}
		if (key === "tab" || key === "\t") {
			this.setFocus(this.focus === "categories" ? "content" : "categories");
			return "handled";
		}
		if (key === "enter" || key === "return") {
			this.select();
			return "handled";
		}
		return "ignored";
	}

	subscribe(listener: () => void): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	private notify(): void {
		for (const listener of this.listeners) listener();
	}
}
