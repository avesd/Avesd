/**
 * @author Avesd
 * @package Desktop
 * @namespace TestUnitMainAgent
 * @description Session deletion and asynchronous subscriber lifecycle regressions
 */

import { sessionAgentService } from "../../../../../src/renderer/src/components/session-agent-service";
import type { AgentSessionsApi, AgentSessionsChange, AgentSessionSnapshot } from "../../../../../src/shared/agent/sessions";
import { describe, expect, it, vi } from "vitest";

describe("session notifications", () => {

    it.each([
        "resolve",
        "reject",
    ])("ignores a late %s after deletion and unsubscribes", async outcome => {

        let notify!: (change: AgentSessionsChange) => void;
        let resolve!: (snapshot: AgentSessionSnapshot | null) => void;
        let reject!: (error: Error) => void;
        const read = vi.fn(() => {

            return new Promise<AgentSessionSnapshot | null>((yes, no) => {

                resolve = yes; reject = no;
            });
        });
        const unsubscribe = vi.fn();
        const api = {
            read,
            subscribe(listener: (change: AgentSessionsChange) => void) {

                notify = listener;

                return unsubscribe;
            },
        } as unknown as AgentSessionsApi;
        const listener = vi.fn();
        const dispose = sessionAgentService(api, "selected").subscribe(listener);
        notify({
            type: "updated",
            id: "other",
        });
        expect(read).toHaveBeenCalledTimes(1);
        notify({
            type: "removed",
            id: "selected",
        });
        expect(unsubscribe).toHaveBeenCalledOnce();
        listener.mockClear();
        if (outcome === "resolve") {
            resolve(null);
        }
        else {
            reject(new Error("Synthetic late failure"));
        }
        await Promise.resolve();
        notify({
            type: "updated",
            id: "selected",
        });
        expect(listener).not.toHaveBeenCalled();
        expect(read).toHaveBeenCalledTimes(1);
        await dispose();
    });

    it("coalesces updates and treats a missing snapshot as normal termination", async () => {

        let notify!: (change: AgentSessionsChange) => void;
        let resolve!: (snapshot: AgentSessionSnapshot | null) => void;
        const read = vi.fn().mockImplementationOnce(() => {

            return new Promise<AgentSessionSnapshot | null>(yes => {

                resolve = yes;
            });
        })
            .mockResolvedValue(null);
        const unsubscribe = vi.fn();
        const api = {
            read,
            subscribe(listener: (change: AgentSessionsChange) => void) {

                notify = listener;

                return unsubscribe;
            },
        } as unknown as AgentSessionsApi;
        const listener = vi.fn();
        sessionAgentService(api, "selected").subscribe(listener);
        notify({
            type: "updated",
            id: "selected",
        });
        notify({
            type: "updated",
            id: "selected",
        });
        expect(read).toHaveBeenCalledTimes(1);
        resolve(null);
        await vi.waitFor(() => {

            expect(unsubscribe).toHaveBeenCalledOnce();
        });
        expect(read).toHaveBeenCalledTimes(2);
        expect(listener.mock.calls).toEqual([
            [{ type: "sessionReset" }],
            [
                {
                    type: "status",
                    status: "disconnected",
                },
            ],
        ]);
    });
});
