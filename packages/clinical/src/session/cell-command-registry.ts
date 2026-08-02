import type {
	CellCommand,
	CellCommandContext,
	CellCommandResult,
	CellCommandVerb,
} from "./cell-command";
import {
	CELL_COMMAND_ERROR_MESSAGES,
	CellCommandError,
	INVALID_ARG_MESSAGES,
	InvalidArgReason,
} from "./cell-command";
import { resolveFieldTarget, setNestedField } from "./cell-command-context";
import { CellCommandParser } from "./cell-command-parser";
import type { CommandArgSchema, CommandDescriptor } from "./command-descriptor";
import { CommandGroup } from "./command-descriptor";

const COMMAND_DESCRIPTOR_GROUP: Record<string, CommandGroup> = {
	up: CommandGroup.Navigation,
	down: CommandGroup.Navigation,
	top: CommandGroup.Navigation,
	bottom: CommandGroup.Navigation,
	go: CommandGroup.Navigation,
	run: CommandGroup.Cell,
	preview: CommandGroup.Cell,
	delete: CommandGroup.Cell,
	mode: CommandGroup.Cell,
	target: CommandGroup.Field,
	link: CommandGroup.Field,
	unlink: CommandGroup.Field,
	parent: CommandGroup.Field,
	help: CommandGroup.System,
	status: CommandGroup.Session,
	clear: CommandGroup.Session,
	save: CommandGroup.Session,
};

const COMMAND_DESCRIPTOR_ARGS: Record<string, CommandArgSchema[]> = {
	go: [{ name: "index", required: true, descriptionKey: "arg.go.index" }],
	mode: [
		{
			name: "mode",
			required: true,
			descriptionKey: "arg.mode.name",
			completions: ["cdsl", "narrative", "js_script"],
		},
	],
	target: [
		{ name: "field", required: true, descriptionKey: "arg.set.field" },
		{ name: "value", required: true, descriptionKey: "arg.set.value" },
	],
	link: [
		{
			name: "targetSchema",
			required: true,
			descriptionKey: "arg.link.targetSchema",
		},
		{
			name: "targetCellId",
			required: true,
			descriptionKey: "arg.link.targetCellId",
		},
		{
			name: "targetField",
			required: true,
			descriptionKey: "arg.link.targetField",
		},
	],
	parent: [
		{ name: "cellId", required: true, descriptionKey: "arg.parent.cellId" },
	],
};

export type CellCommandHandler = (
	command: CellCommand,
	ctx: CellCommandContext,
) => Promise<CellCommandResult>;

const ok = (output?: unknown): CellCommandResult => ({ success: true, output });

const fail = (code: CellCommandError, arg?: string): CellCommandResult => {
	const msg =
		typeof CELL_COMMAND_ERROR_MESSAGES[code] === "function"
			? (CELL_COMMAND_ERROR_MESSAGES[code] as (arg: string) => string)(
					arg ?? "",
				)
			: (CELL_COMMAND_ERROR_MESSAGES[code] as string);
	return { success: false, errorCode: code, message: msg };
};

export class CellCommandRegistry {
	private handlers = new Map<string, CellCommandHandler>();

	register(verb: CellCommandVerb, handler: CellCommandHandler): this {
		this.handlers.set(verb.toLowerCase(), handler);
		return this;
	}

	get(verb: string): CellCommandHandler | undefined {
		return this.handlers.get(verb.toLowerCase());
	}

	async dispatch(
		command: CellCommand,
		ctx: CellCommandContext,
	): Promise<CellCommandResult> {
		const handler = this.get(command.verb);
		return handler
			? handler(command, ctx)
			: fail(CellCommandError.UNKNOWN_COMMAND, command.verb);
	}

	/** Build help text from registered command verbs. */
	helpText(token: string = ":"): string {
		const verbs = Array.from(this.handlers.keys()).sort().join(` ${token}`);
		return `${token}${verbs}`;
	}

	getDescriptors(): CommandDescriptor[] {
		// Define cell command aliases mapping: canonicalVerb -> aliases
		const aliasesMap: Record<string, string[]> = {
			target: ["set"],
		};
		// Only display/keep the canonical verbs as top-level descriptors.
		// Handlers that are actual aliases are excluded from the main descriptor list.
		const allAliases = new Set(Object.values(aliasesMap).flat());
		const verbs = Array.from(this.handlers.keys())
			.filter((verb) => !allAliases.has(verb))
			.sort();

		return verbs.map((verb) => ({
			verb,
			aliases: aliasesMap[verb] ?? [],
			group: COMMAND_DESCRIPTOR_GROUP[verb] ?? CommandGroup.Cell,
			descriptionKey: `command.description.${verb}`,
			args: COMMAND_DESCRIPTOR_ARGS[verb] ?? [],
		}));
	}

	static createDefault(): CellCommandRegistry {
		const registry = new CellCommandRegistry();
		registry.register("up", async (_c, ctx) => ({
			success: true,
			targetCellIndex: Math.max(0, (ctx.activeCellIndex ?? 0) - 1),
		}));
		registry.register("down", async (_c, ctx) => ({
			success: true,
			targetCellIndex: (ctx.activeCellIndex ?? 0) + 1,
		}));
		registry.register("top", async () => ({
			success: true,
			targetCellIndex: 0,
		}));
		registry.register("bottom", async (_c, ctx) => ({
			success: true,
			targetCellIndex: Math.max(0, (ctx.cells?.length ?? 1) - 1),
		}));
		registry.register("go", async (c) => {
			const index = Number(c.args[0]);
			return Number.isInteger(index) && index >= 0
				? { success: true, targetCellIndex: index }
				: fail(
						CellCommandError.INVALID_ARGUMENT,
						INVALID_ARG_MESSAGES[InvalidArgReason.GO_INDEX],
					);
		});
		registry.register("delete", async (_c, ctx) => {
			if (!ctx.processor) return fail(CellCommandError.CONFIGURATION);
			return { success: !ctx.processor.delete(ctx.cell).error, cell: ctx.cell };
		});
		registry.register("mode", async (c, ctx) => {
			const mode = c.args[0];
			if (mode !== "cdsl" && mode !== "narrative" && mode !== "js_script")
				return fail(CellCommandError.INVALID_MODE);
			ctx.cell.mode = mode;
			return { success: true, cell: ctx.cell };
		});
		registry.register("parent", async (c, ctx) => {
			if (!c.args[0])
				return fail(
					CellCommandError.INVALID_ARGUMENT,
					INVALID_ARG_MESSAGES[InvalidArgReason.PARENT_ID],
				);
			ctx.cell.parentCellId = c.args[0];
			return { success: true, cell: ctx.cell };
		});
		registry.register("link", async (c, ctx) => {
			const { values } = CellCommandParser.parseKeyValues(c.args);
			if (!values.targetSchema || !values.targetCellId || !values.targetField)
				return fail(
					CellCommandError.INVALID_ARGUMENT,
					INVALID_ARG_MESSAGES[InvalidArgReason.LINK_TARGET],
				);
			const mergeStrategy = values.strategy ?? "replace";
			if (
				!["replace", "append", "deep_merge", "partial_fill"].includes(
					mergeStrategy,
				)
			)
				return fail(CellCommandError.INVALID_MERGE_STRATEGY);
			ctx.cell.linkTarget = {
				targetSchema: values.targetSchema,
				targetCellId: values.targetCellId,
				targetField: values.targetField,
				mergeStrategy: mergeStrategy as any,
			};
			return { success: true, cell: ctx.cell };
		});
		registry.register("unlink", async (_c, ctx) => {
			delete ctx.cell.linkTarget;
			return { success: true, cell: ctx.cell };
		});
		registry.register("target", async (c, ctx) => {
			const equals = c.args.indexOf("=");
			const field = equals >= 0 ? c.args.slice(0, equals).join(" ") : c.args[0];
			const value =
				equals >= 0
					? c.args.slice(equals + 1).join(" ")
					: c.args.slice(1).join(" ");
			if (!field || !value)
				return fail(
					CellCommandError.INVALID_ARGUMENT,
					INVALID_ARG_MESSAGES[InvalidArgReason.SET_FIELD_VALUE],
				);
			const target = resolveFieldTarget(field, value, ctx.cell, ctx.profile);
			if (!target) return fail(CellCommandError.UNRESOLVED_TARGET);
			let parsedValue: unknown = value;
			if (ctx.parser) {
				const parsed = await ctx.parser.parse(value, undefined, {
					targetSchema: target.targetSchema,
				});
				const first = parsed[0];
				const leaf = target.fieldPath.split(".").filter(Boolean).pop();
				if (first && leaf && first.extractedData[leaf] !== undefined)
					parsedValue = first.extractedData[leaf];
			}
			const extractedData: Record<string, any> = {};
			setNestedField(extractedData, target.fieldPath, parsedValue);
			ctx.cell.parsedOutput = [
				{
					targetSchema: target.targetSchema,
					attributes: {},
					concept: [],
					rawText: value,
					tag: `#${target.targetSchema}`,
					extractedData,
				},
			];
			return {
				success: true,
				cell: ctx.cell,
				parsedOutput: ctx.cell.parsedOutput,
			};
		});
		// Legacy alias retained at the parser boundary while :target becomes the
		// documented cell-targeting command. Variable assignment uses :var set.
		registry.register("set", async (c, ctx) => {
			return registry.get("target")!(c, ctx);
		});
		registry.register("help", async (_c, ctx) =>
			ok(registry.helpText(ctx.profile.cellCommandToken || ":")),
		);
		registry.register("status", async (_c, ctx) =>
			ok({
				sessionId: ctx.sessionId,
				cellCount: ctx.cells?.length ?? 1,
				cellStatus: ctx.cell.status,
			}),
		);
		registry.register("clear", async () => ok());
		registry.register("save", async (_c, ctx) => ({
			success: true,
			cell: ctx.cell,
		}));
		return registry;
	}
}
