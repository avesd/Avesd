/**
 * @author Avesd
 * @package ACP Client
 * @namespace Root
 * @description ACP Client Test
 */

import { AcpClient } from "./acp-client";
import type { AcpTransport } from "./acp-protocol";
import { describe, expect, it, vi } from "vitest";

describe("AcpClient", () => {
    it("uses ACP v1 session methods without provider-specific behavior", async () => {
        const requests: string[] = [];
        const notify = vi.fn();
        const transport: AcpTransport = {
            notify,
            onNotification: () => {
                return () => {
                    return undefined;
                };
            },
            async request<TResult>(method: string): Promise<TResult> {
                requests.push(method);
                const response = method === "initialize"
                    ? {
                        agentCapabilities: {},
                        protocolVersion: 1,
                    }
                    : method === "session/new"
                        ? { sessionId: "session-1" }
                        : { stopReason: "end_turn" };
                return response as TResult;
            },
        };
        const client = new AcpClient(transport);

        await client.initialize({
            name: "avesd",
            version: "0.0.0",
        }, { terminal: true });
        await client.newSession("/workspace");
        await client.prompt("session-1", [
            {
                text: "Update the UI",
                type: "text",
            },
        ]);
        client.cancel("session-1");

        expect(requests).toEqual([
            "initialize",
            "session/new",
            "session/prompt",
        ]);
        expect(notify).toHaveBeenCalledWith("session/cancel", { sessionId: "session-1" });
    });
});
