import { expect, it } from "vitest";
import { authorizeAvesdTool } from "./agent-tool-permission";

it("allows only registered tools from the Avesd MCP server", () => {
  expect(authorizeAvesdTool({ rawInput: { server: "avesd", tool: "avesd_test_plugin" } })).toBe(true);
  expect(authorizeAvesdTool({ rawInput: { server: "other", tool: "avesd_test_plugin" } })).toBe(false);
  expect(authorizeAvesdTool({ rawInput: { server: "avesd", tool: "avesd_shell" } })).toBe(false);
  expect(authorizeAvesdTool({})).toBe(false);
});
