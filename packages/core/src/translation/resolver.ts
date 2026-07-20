import { resolveSource } from "../config/loader";
import type { ResourceLocator } from "../config/types";
import type { TableTranslation } from "./types";

export async function resolveTranslation(
  locator: ResourceLocator,
  workspaceRoot: string
): Promise<TableTranslation> {
  return await resolveSource(locator, workspaceRoot) as TableTranslation;
}
