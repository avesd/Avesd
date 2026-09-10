/**
 * @author Avesd
 * @package ACP Client
 * @namespace Root
 * @description Negotiated structured ACP session failures
 */

export const sessionFailureCapabilities = {
    _meta: {
        jetbrains: {
            air: {
                version: 1,
                capabilities: ["sessionFailure"],
            },
        },
    },
};

function record(value: unknown): Record<string, unknown> | undefined {

    return value !== null && typeof value === "object" && !Array.isArray(value)
        ? value as Record<string, unknown> : undefined;
}

/** Read protocol metadata only; assistant text is never an error signal. */
export function sessionFailureError(meta: unknown): Error | undefined {

    const air = record(record(record(meta)?.jetbrains)?.air);
    const failure = record(air?.sessionFailure);
    if (air?.version !== 1 || failure?.severity !== "error") {
        return undefined;
    }

    // Provider titles may contain raw responses or private details. Keep UI errors bounded and local.
    return new Error("The agent could not complete this request. Check its model, CLI version and local login in Settings → Agents, then retry.");
}
