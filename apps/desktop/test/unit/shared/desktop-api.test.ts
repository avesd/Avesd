/**
 * @author Avesd
 * @package Desktop
 * @namespace TestUnitShared
 * @description Desktop API Test
 */

import { formatRuntimeSummary, parseAgentPrompt } from "../../../src/shared/desktop-api";
import { describe, expect, it } from "vitest";

describe("formatRuntimeSummary", () => {

    it("formats the Electron version and platform", () => {

        expect(formatRuntimeSummary({
            chrome: "136.0.0",
            electron: "43.4.1",
            node: "24.11.1",
            platform: "darwin",
        })).toBe("Electron 43.4.1 · darwin");
    });

    it("validates and normalizes agent prompts at the IPC boundary", () => {

        expect(parseAgentPrompt("  hello  ")).toBe("hello");
        expect(() => {

            return parseAgentPrompt("   ");
        }).toThrow("cannot be empty");
        expect(() => {

            return parseAgentPrompt({ text: "hello" });
        }).toThrow("must be a string");
    });
});
