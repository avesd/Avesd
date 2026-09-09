/**
 * @author Avesd
 * @package ACP Client
 * @namespace Root
 * @description ACP Client
 */

import type { AcpClientCapabilities, AcpContentBlock, AcpInitializeResult, AcpSessionUpdate, AcpTransport } from "./acp-protocol";

export class AcpClient {
    constructor(private readonly transport: AcpTransport) {}

    initialize(clientInfo: {
        readonly name: string;
        readonly title?: string;
        readonly version: string;
    }, clientCapabilities: AcpClientCapabilities): Promise<AcpInitializeResult> {
        return this.transport.request("initialize", {
            clientCapabilities,
            clientInfo,
            protocolVersion: 1,
        });
    }

    newSession(cwd: string): Promise<{
        readonly sessionId: string;
    }> {
        return this.transport.request("session/new", {
            cwd,
            mcpServers: [],
        });
    }

    loadSession(sessionId: string, cwd: string): Promise<void> {
        return this.transport.request("session/load", {
            cwd,
            mcpServers: [],
            sessionId,
        });
    }

    prompt(sessionId: string, prompt: readonly AcpContentBlock[]): Promise<{
        readonly stopReason: string;
    }> {
        return this.transport.request("session/prompt", {
            prompt,
            sessionId,
        });
    }

    cancel(sessionId: string): void {
        this.transport.notify("session/cancel", { sessionId });
    }

    onSessionUpdate(listener: (update: AcpSessionUpdate) => void): () => void {
        return this.transport.onNotification((method, params) => {
            if (method === "session/update") {
                listener(params as AcpSessionUpdate);
            }
        });
    }
}
