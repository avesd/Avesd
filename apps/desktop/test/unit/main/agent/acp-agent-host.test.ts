/**
 * @author Avesd
 * @package Desktop
 * @namespace TestUnitMainAgent
 * @description Cancellation during asynchronous adapter preparation
 */

import { AcpAgentHost } from "../../../../src/main/agent/acp-agent-host";
import { AgentPreferences } from "../../../../src/main/agent/agent-preferences";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { expect, it, vi } from "vitest";

vi.mock("node:child_process", () => {

    return { spawn: vi.fn() };
});
vi.mock("node:fs/promises", async importOriginal => {

    return {
        ...await importOriginal<typeof import("node:fs/promises")>(),
        mkdir: vi.fn().mockResolvedValue(undefined),
        mkdtemp: vi.fn(),
        rm: vi.fn().mockResolvedValue(undefined),
    };
});

it("does not spawn after disposal while its scratch directory is being created", async () => {

    let release!: (path: string) => void;
    vi.mocked(mkdtemp).mockImplementation(() => {

        return new Promise<string>(resolve => {

            release = resolve;
        });
    });
    const host = new AcpAgentHost("/synthetic-runtime", {
        url: "http://127.0.0.1:1",
        token: "synthetic",
    }, "/unused", new AgentPreferences(), [
        {
            id: "synthetic",
            name: "Synthetic",
            launch: () => {

                return {
                    command: "synthetic",
                    args: [],
                };
            },
        },
    ], async () => {

        return {
            workspaceName: "Synthetic",
            dashboardName: "Synthetic",
        };
    });
    const connecting = host.connect();
    const rejected = expect(connecting).rejects.toThrow("ended");
    await vi.waitFor(() => {

        expect(mkdtemp).toHaveBeenCalledOnce();
    });
    host.dispose(); release("/synthetic-runtime/session-test");
    await rejected;
    expect(spawn).not.toHaveBeenCalled();
    expect(rm).toHaveBeenCalledWith("/synthetic-runtime/session-test", {
        recursive: true,
        force: true,
    });
});
