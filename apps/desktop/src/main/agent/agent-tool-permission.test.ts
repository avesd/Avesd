/**
 * @author Avesd
 * @package Desktop
 * @namespace Root
 * @description Agent Tool Permission Test
 */

import { authorizeAvesdTool } from "./agent-tool-permission";
import { expect, it } from "vitest";

it("allows only registered tools from the Avesd MCP server", () => {
    expect(authorizeAvesdTool({
        rawInput: {
            server: "avesd",
            tool: "avesd_test_plugin",
        },
    })).toBe(true);
    expect(authorizeAvesdTool({
        rawInput: {
            server: "other",
            tool: "avesd_test_plugin",
        },
    })).toBe(false);
    expect(authorizeAvesdTool({
        rawInput: {
            server: "avesd",
            tool: "avesd_shell",
        },
    })).toBe(false);
    expect(authorizeAvesdTool({})).toBe(false);
});
