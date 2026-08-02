import { describe, expect, test } from "bun:test";
import { EditorCommandRegistry } from "@stateful-mcp/clinical/session/editor-command-registry";
import { dispatchGeneralWindowCommand } from "../src/lib/notebook-extension";
describe("gw alias", () => {
  test("editor registry canonicalizes gw to workspace", () => {
    const r = EditorCommandRegistry.createDefault();
    expect(r.canonicalize("gw")).toBe("workspace");
    expect(r.dispatch("gw", []).action).toBe("toggle_workspace");
  });
  test("general window dispatch resolves :gw", () => {
    expect(dispatchGeneralWindowCommand(":gw")?.action).toBe("toggle_workspace");
  });
});
