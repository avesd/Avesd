/**
 * @author Avesd
 * @package Desktop
 * @namespace TestIntegrationMainAgent
 * @description Adapter shutdown escalates when graceful termination is ignored
 */

import { stopAgentProcess } from "../../../../src/main/agent/stop-agent-process";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { expect, it } from "vitest";

it("waits for a resistant adapter to exit before resolving", async () => {

    const child = spawn(process.execPath, [
        "-e",
        "process.on('SIGTERM', () => {}); process.stdout.write('ready'); setInterval(() => {}, 1000);",
    ], {
        stdio: [
            "ignore",
            "pipe",
            "ignore",
        ],
    });
    try {
        await once(child.stdout, "data");
        await stopAgentProcess(child);
        expect(child.signalCode).toBe("SIGKILL");
        await stopAgentProcess(child);
    } finally {
        if (child.exitCode === null && child.signalCode === null) {
            child.kill("SIGKILL");
        }
    }
});
