/**
 * @author Avesd
 * @package Desktop
 * @namespace TestIntegrationMainAgent
 * @description Agent Gateway Test
 */

import { openAgentGateway } from "../../../../src/main/agent/agent-gateway";
import { expect, it, vi } from "vitest";

it("rejects missing credentials and browser origins and only relays authenticated requests", async () => {

    const invoke = vi.fn(async () => {

        return {
            content: [
                {
                    type: "text" as const,
                    text: "synthetic result",
                },
            ],
        };
    });
    const gateway = await openAgentGateway(invoke);
    try {
        const request = {
            method: "POST",
            body: JSON.stringify({
                name: "avesd_get_widget_sdk",
                input: {},
            }),
        };
        expect((await fetch(gateway.url, request)).status).toBe(403);
        const headers = {
            authorization: `Bearer ${gateway.token}`,
            "content-type": "application/json",
        };
        expect((await fetch(gateway.url, {
            ...request,
            headers: {
                ...headers,
                origin: "null",
            },
        })).status).toBe(403);
        expect(invoke).not.toHaveBeenCalled();
        expect((await fetch(gateway.url, {
            ...request,
            headers,
        })).status).toBe(200);
        expect(invoke).toHaveBeenCalledWith("avesd_get_widget_sdk", {});
    } finally { gateway.close(); }
});

it("revokes old session credentials when the active dashboard changes", async () => {

    const invoke = vi.fn(async () => {

        return { content: [] };
    });
    const gateway = await openAgentGateway(invoke);
    try {
        const request = (token: string) => {

            return fetch(gateway.url, {
                method: "POST",
                headers: {
                    authorization: `Bearer ${token}`,
                    "content-type": "application/json",
                },
                body: JSON.stringify({
                    name: "avesd_inspect_dashboard",
                    input: {},
                }),
            });
        };
        const oldToken = gateway.token;
        gateway.rotateToken();
        expect((await request(oldToken)).status).toBe(403);
        expect(invoke).not.toHaveBeenCalled();
        expect((await request(gateway.token)).status).toBe(200);
        expect(invoke).toHaveBeenCalledOnce();
    } finally { gateway.close(); }
});
