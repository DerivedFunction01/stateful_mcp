import type { CommandContribution, CommandHandler } from "./types";

export interface RegisteredCommand extends CommandContribution {
	readonly extensionId?: string;
	readonly handler?: CommandHandler;
}

export class CommandRegistry {
	private readonly commands = new Map<string, RegisteredCommand>();
	private readonly listeners = new Set<() => void>();

	registerCommand(
		command: CommandContribution,
		handler?: CommandHandler,
		extensionId?: string,
	): void {
		this.commands.set(command.command, {
			...command,
			handler,
			extensionId,
		});
		this.notify();
	}

	registerCommandHandler(commandId: string, handler: CommandHandler): boolean {
		const existing = this.commands.get(commandId);
		if (existing) {
			this.commands.set(commandId, { ...existing, handler });
			this.notify();
			return true;
		}
		return false;
	}

	unregisterCommand(commandId: string): boolean {
		const removed = this.commands.delete(commandId);
		if (removed) {
			this.notify();
		}
		return removed;
	}

	getCommands(): readonly RegisteredCommand[] {
		return Array.from(this.commands.values());
	}

	getCommand(commandId: string): RegisteredCommand | undefined {
		return this.commands.get(commandId);
	}

	async executeCommand<T = unknown>(
		commandId: string,
		...args: unknown[]
	): Promise<T> {
		const cmd = this.commands.get(commandId);
		if (!cmd) {
			throw new Error(`Command '${commandId}' not found.`);
		}
		if (!cmd.handler) {
			throw new Error(`Command '${commandId}' has no registered handler.`);
		}
		return (await cmd.handler.execute(...args)) as T;
	}

	subscribe(listener: () => void): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	private notify(): void {
		for (const listener of this.listeners) {
			try {
				listener();
			} catch (e) {
				console.error("Error in CommandRegistry listener:", e);
			}
		}
	}
}
