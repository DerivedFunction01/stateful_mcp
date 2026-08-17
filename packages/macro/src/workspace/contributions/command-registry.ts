import type { WorkspaceCommandDescriptor } from "../commands/command-descriptor";
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

	getDescriptors(): readonly WorkspaceCommandDescriptor[] {
		return this.getCommands().map((command) => ({
			id: command.command,
			title: command.title,
			verb: command.verb,
			aliases: command.aliases,
			category: command.category,
			description: command.description,
			keybinding: command.keybinding,
			args: command.args,
			execute: (args) => this.executeCommand(command.command, ...args),
		}));
	}

	resolveVerb(verb: string): RegisteredCommand | undefined {
		const value = verb.toLowerCase();
		return this.getCommands().find((command) =>
			[command.verb, ...(command.aliases ?? [])].some(
				(candidate) => candidate?.toLowerCase() === value,
			),
		);
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
