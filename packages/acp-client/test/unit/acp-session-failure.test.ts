/**
 * @author Avesd
 * @package ACP Client
 * @namespace TestUnit
 * @description Structured failure metadata boundaries
 */

import { sessionFailureError } from "../../src/acp-session-failure";
import { expect, it } from "vitest";

it("ignores warnings, unsupported extensions and error-shaped assistant text", () => {

    for (const value of [
        undefined,
        null,
        [],
        "{\"type\":\"error\"}",
        { severity: "error" },
        {
            jetbrains: {
                air: {
                    version: 2,
                    sessionFailure: { severity: "error" },
                },
            },
        },
        {
            jetbrains: {
                air: {
                    version: 1,
                    sessionFailure: { severity: "warning" },
                },
            },
        },
    ]) {
        expect(sessionFailureError(value)).toBeUndefined();
    }
    const failure = sessionFailureError({
        jetbrains: {
            air: {
                version: 1,
                sessionFailure: {
                    severity: "error",
                    title: "Synthetic private response",
                },
            },
        },
    });
    expect(failure?.message).toContain("CLI version");
    expect(failure?.message).not.toContain("Synthetic private response");
});
