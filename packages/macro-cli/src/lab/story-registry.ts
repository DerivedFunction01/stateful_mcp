import type { TuiStory, TuiStoryContribution } from "./story-contract";

export class TuiStoryRegistry {
	private readonly stories = new Map<string, TuiStory>();
	private readonly extensionStories = new Map<string, TuiStoryContribution>();

	public register(story: TuiStory): void {
		this.stories.set(story.id, story);
	}

	public registerContribution(contribution: TuiStoryContribution): void {
		this.extensionStories.set(contribution.id, contribution);
		this.stories.set(contribution.id, {
			id: contribution.id,
			title: contribution.title,
			category: "Extensions",
			ownerExtensionId: contribution.ownerExtensionId,
			states: contribution.states,
			render: (ctx) => contribution.render(ctx),
		});
	}

	public unregisterContribution(id: string): void {
		this.extensionStories.delete(id);
		this.stories.delete(id);
	}

	public removeExtensionContributions(ownerExtensionId: string): void {
		for (const [id, contribution] of this.extensionStories.entries()) {
			if (contribution.ownerExtensionId === ownerExtensionId) {
				this.unregisterContribution(id);
			}
		}
	}

	public getStory(id: string): TuiStory | undefined {
		return this.stories.get(id);
	}

	public listStories(): readonly TuiStory[] {
		// Deterministic sort by category then id
		const categoryOrder: Record<string, number> = {
			Core: 0,
			Scratchpad: 1,
			Modals: 2,
			Primitives: 3,
			Views: 4,
			Extensions: 5,
		};

		return Array.from(this.stories.values()).sort((a, b) => {
			const catA = categoryOrder[a.category ?? "Core"] ?? 99;
			const catB = categoryOrder[b.category ?? "Core"] ?? 99;
			if (catA !== catB) return catA - catB;
			return a.id.localeCompare(b.id);
		});
	}

	public clear(): void {
		this.stories.clear();
		this.extensionStories.clear();
	}
}

export const globalStoryRegistry = new TuiStoryRegistry();
